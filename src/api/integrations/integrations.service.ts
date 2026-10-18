import { Injectable, NotFoundException } from "@nestjs/common";
import { IntegrationConnection } from "@prisma/client";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { CustomersService } from "../customers/customers.service";
import { InvoicesService } from "../invoices/invoices.service";
import { JournalService } from "../journal/journal.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { SyncSubscriberInvoiceDto } from "./dto/sync-subscriber-invoice.dto";

export const INTEGRATION_KEY_PREFIX = "nwb_";
const KEY_DISPLAY_PREFIX_LENGTH = 12;
export const SSO_CODE_TTL_MS = 2 * 60 * 1000; // 2 minutes — the code only has to survive one browser redirect
const UPCOMING_DEADLINE_LIMIT = 10;
// lastUsedAt is informational ("is this key still in use?"), so it is refreshed at most this
// often rather than costing a database write on every summary poll.
const LAST_USED_REFRESH_MS = 5 * 60 * 1000;

export function hashSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/** Never returns keyHash — a connection as shown to users and integrations. */
function toPublicConnection(c: IntegrationConnection) {
  return { id: c.id, companyId: c.companyId, label: c.label, keyPrefix: c.keyPrefix, createdAt: c.createdAt, lastUsedAt: c.lastUsedAt, revokedAt: c.revokedAt };
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly customers: CustomersService,
    private readonly invoices: InvoicesService,
    private readonly journal: JournalService,
    private readonly auditLog: AuditLogService
  ) {}

  // ── Management (by a logged-in user of the company's organization) ──────────────────

  async listForCompany(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const connections = await this.prisma.integrationConnection.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
    return connections.map(toPublicConnection);
  }

  /**
   * Creates a connection and returns its key exactly ONCE — only the hash is persisted,
   * so a lost key is replaced by revoking and creating a new one, never recovered.
   */
  async create(organizationId: string, companyId: string, userId: string, label: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const key = INTEGRATION_KEY_PREFIX + crypto.randomBytes(32).toString("base64url");

    const connection = await this.prisma.integrationConnection.create({
      data: { organizationId, companyId, label, keyHash: hashSecret(key), keyPrefix: key.slice(0, KEY_DISPLAY_PREFIX_LENGTH), createdByUserId: userId },
    });

    await this.auditLog.record({
      organizationId,
      userId,
      action: "CREATE",
      objectType: "IntegrationConnection",
      objectId: connection.id,
      newValue: { companyId, label, keyPrefix: connection.keyPrefix },
    });

    return { connection: toPublicConnection(connection), key };
  }

  async revoke(organizationId: string, companyId: string, userId: string, connectionId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const connection = await this.prisma.integrationConnection.findUnique({ where: { id: connectionId } });
    if (!connection || connection.companyId !== companyId) throw new NotFoundException("Connection not found.");
    if (connection.revokedAt) return toPublicConnection(connection);

    const revoked = await this.prisma.integrationConnection.update({ where: { id: connectionId }, data: { revokedAt: new Date() } });
    await this.auditLog.record({
      organizationId,
      userId,
      action: "REVOKE",
      objectType: "IntegrationConnection",
      objectId: connectionId,
      newValue: { revokedAt: revoked.revokedAt },
    });
    return toPublicConnection(revoked);
  }

  // ── Machine API (authenticated by the integration key) ──────────────────────────────

  /** Resolves a presented key to its active connection, or null — the guard turns null into a 401. */
  async authenticate(key: string): Promise<IntegrationConnection | null> {
    if (!key.startsWith(INTEGRATION_KEY_PREFIX)) return null;
    const connection = await this.prisma.integrationConnection.findUnique({ where: { keyHash: hashSecret(key) } });
    if (!connection || connection.revokedAt) return null;

    if (!connection.lastUsedAt || Date.now() - connection.lastUsedAt.getTime() > LAST_USED_REFRESH_MS) {
      await this.prisma.integrationConnection.update({ where: { id: connection.id }, data: { lastUsedAt: new Date() } });
    }
    return connection;
  }

  /**
   * Read-only compliance snapshot for the linked company. Every figure here is one the
   * tax engine has ALREADY produced (calendar entries, tax returns) — nothing is computed
   * on the fly, and a liability the engine withheld stays null, never a misleading 0.
   */
  async summary(connection: IntegrationConnection) {
    const { companyId } = connection;
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const now = Date.now();

    const [openEntries, latestVat, latestCit, unreadNotifications] = await Promise.all([
      this.prisma.complianceCalendarEntry.findMany({
        where: { companyId, filingStatus: { not: "FILED" } },
        orderBy: { statutoryDeadline: "asc" },
      }),
      this.prisma.taxReturn.findFirst({ where: { companyId, taxType: "VAT" }, orderBy: { periodEnd: "desc" } }),
      this.prisma.taxReturn.findFirst({ where: { companyId, taxType: "CIT" }, orderBy: { periodEnd: "desc" } }),
      this.prisma.notification.count({ where: { companyId, userId: null, readAt: null } }),
    ]);

    const deadlines = openEntries.map((e) => ({
      taxType: e.taxType,
      periodLabel: e.periodLabel,
      statutoryDeadline: e.statutoryDeadline,
      daysRemaining: Math.ceil((e.statutoryDeadline.getTime() - now) / (1000 * 60 * 60 * 24)),
      amountNgn: e.amountNgn === null ? null : e.amountNgn.toString(),
      filingStatus: e.filingStatus,
      paymentStatus: e.paymentStatus,
      isOverdue: e.statutoryDeadline.getTime() < now,
    }));

    const toReturnSummary = (r: typeof latestVat) =>
      r && {
        taxType: r.taxType,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        status: r.status,
        complianceState: r.complianceState,
        taxLiabilityNgn: r.taxLiabilityNgn === null ? null : r.taxLiabilityNgn.toString(),
      };

    return {
      company: { id: company.id, name: company.name, vatRegistered: company.vatRegistered },
      overdueCount: deadlines.filter((d) => d.isOverdue).length,
      upcomingDeadlines: deadlines.slice(0, UPCOMING_DEADLINE_LIMIT),
      latestReturns: { VAT: toReturnSummary(latestVat), CIT: toReturnSummary(latestCit) },
      unreadNotifications,
      appUrl: `${process.env.FRONTEND_URL ?? ""}/companies/${company.id}`,
      generatedAt: new Date(),
    };
  }

  /**
   * Mints a single-use sign-in code for a user who ALREADY has an active membership in the
   * connection's organization. The integration vouches for who is signing in (that user
   * is logged in to the external system); it can never create users or widen access.
   * The code travels in the URL fragment so it never reaches server logs or Referer headers.
   */
  async createSsoLink(connection: IntegrationConnection, email: string) {
    // Case-insensitive: the external system may hold the same address with different casing.
    const user = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
    const membership =
      user && user.isActive && !user.erasedAt
        ? await this.prisma.organizationUser.findFirst({ where: { userId: user.id, organizationId: connection.organizationId, status: "ACTIVE" } })
        : null;
    if (!user || !membership) {
      throw new NotFoundException("No active Netwave Books user with that email in the connected organization.");
    }

    const code = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SSO_CODE_TTL_MS);
    await this.prisma.integrationSsoCode.create({ data: { connectionId: connection.id, userId: user.id, codeHash: hashSecret(code), expiresAt } });

    await this.auditLog.record({
      organizationId: connection.organizationId,
      userId: user.id,
      action: "CREATE",
      objectType: "IntegrationSsoCode",
      objectId: connection.id,
      reason: `Sign-in link requested by integration "${connection.label}"`,
    });

    return { url: `${process.env.FRONTEND_URL ?? ""}/sso#code=${code}`, expiresAt };
  }

  /**
   * Ingests one subscriber invoice/payment event from a connected billing system (e.g. an
   * ISP's own tenant-billing-api, via its own stored copy of this connection's key) into
   * this company's real accounting ledger. PAYMENT_CAPTURED creates+posts an Invoice and
   * records the payment against it in one call (the source system only ever tells us about
   * orders that are ALREADY paid — there's no separate "invoice sent, awaiting payment"
   * state to represent). REFUND_ISSUED fully reverses the original posting via
   * JournalService.voidEntry rather than inventing partial-refund logic the source system
   * has no concept of (its own orders.payment_status is a flat 'refunded', never a partial
   * amount).
   *
   * Idempotent on orderReference (→ Invoice.invoiceNumber, already unique per company) and
   * on externalCustomerId (→ Customer.externalRef) — safe to call twice for the same event
   * (a webhook retry, a reconciliation re-sync), never double-posts or double-reverses.
   *
   * The connection's OWN createdByUserId (the person who generated this integration key)
   * is used as the acting user for every posting — there is no logged-in human on this
   * machine-to-machine path, and every journal entry's createdBy is non-nullable, so the
   * key's creator is the most honest "who is accountable for this" attribution available.
   */
  async syncSubscriberInvoice(connection: IntegrationConnection, input: SyncSubscriberInvoiceDto) {
    const { organizationId, companyId, createdByUserId: userId } = connection;

    let customer = await this.prisma.customer.findUnique({
      where: { companyId_externalRef: { companyId, externalRef: input.externalCustomerId } },
    });
    if (!customer) {
      customer = await this.customers.create(organizationId, companyId, {
        name: input.customerName,
        email: input.customerEmail,
        phone: input.customerPhone,
        externalRef: input.externalCustomerId,
      });
    }

    if (input.eventType === "PAYMENT_CAPTURED") {
      const existing = await this.prisma.invoice.findUnique({
        where: { companyId_invoiceNumber: { companyId, invoiceNumber: input.orderReference } },
      });
      if (existing) {
        return { synced: false as const, reason: "ALREADY_SYNCED" as const, invoiceId: existing.id, customerId: customer.id };
      }

      const paidAt = new Date(input.paidAt);
      const draft = await this.invoices.create(organizationId, companyId, userId, {
        customerId: customer.id,
        invoiceNumber: input.orderReference,
        issueDate: paidAt,
        dueDate: paidAt,
        notes: `Synced from connected app "${connection.label}"`,
        // vatRate: 0 — the connected billing system has no VAT concept of its own
        // (orders.amount_naira is a flat charge), so 0 is the honest figure, never a guess.
        items: [{ description: input.description, quantity: 1, unitPriceNgn: input.amountNgn, vatRate: 0 }],
      });
      const posted = await this.invoices.post(organizationId, companyId, userId, draft.id);
      const paid = await this.invoices.recordPayment(organizationId, companyId, userId, posted.id, input.amountNgn, paidAt, "EXTERNAL_SYNC", input.orderReference);

      await this.auditLog.record({
        organizationId,
        userId,
        action: "SYNC_SUBSCRIBER_INVOICE",
        objectType: "Invoice",
        objectId: paid.id,
        newValue: { orderReference: input.orderReference, amountNgn: input.amountNgn, source: connection.label },
      });

      return { synced: true as const, invoiceId: paid.id, customerId: customer.id };
    }

    // REFUND_ISSUED
    const invoice = await this.prisma.invoice.findUnique({
      where: { companyId_invoiceNumber: { companyId, invoiceNumber: input.orderReference } },
      include: { payments: true },
    });
    if (!invoice) {
      return { synced: false as const, reason: "NOTHING_TO_REVERSE" as const, customerId: customer.id };
    }

    const journalEntryIdsToVoid = [invoice.journalEntryId, ...invoice.payments.map((p) => p.journalEntryId)].filter((id): id is string => Boolean(id));
    let reversedSomething = false;
    for (const journalEntryId of journalEntryIdsToVoid) {
      const entry = await this.prisma.journalEntry.findUnique({ where: { id: journalEntryId } });
      if (entry?.status === "POSTED") {
        await this.journal.voidEntry(organizationId, companyId, userId, entry.id, `Refund reported by connected app "${connection.label}": ${input.orderReference}`);
        reversedSomething = true;
      }
    }

    if (reversedSomething) {
      await this.prisma.invoice.update({ where: { id: invoice.id }, data: { status: "VOID" } });
      await this.auditLog.record({
        organizationId,
        userId,
        action: "REVERSE_SUBSCRIBER_INVOICE",
        objectType: "Invoice",
        objectId: invoice.id,
        newValue: { orderReference: input.orderReference, source: connection.label },
      });
    }

    return { synced: reversedSomething, reason: reversedSomething ? undefined : ("ALREADY_REVERSED" as const), invoiceId: invoice.id, customerId: customer.id };
  }
}

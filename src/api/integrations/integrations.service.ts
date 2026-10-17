import { Injectable, NotFoundException } from "@nestjs/common";
import { IntegrationConnection } from "@prisma/client";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { AuditLogService } from "../audit-log/audit-log.service";

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
}

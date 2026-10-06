import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { CustomersService } from "../customers/customers.service";
import { AccountsService } from "../accounts/accounts.service";
import { JournalService } from "../journal/journal.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { calculateDocumentTotals, LineItemInput } from "../../accounting/invoiceCalculations";
import { SYSTEM_ACCOUNT_CODES } from "../../accounting/defaultChartOfAccounts";

export interface CreateInvoiceInput {
  customerId: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  notes?: string;
  items: LineItemInput[];
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly customers: CustomersService,
    private readonly accounts: AccountsService,
    private readonly journal: JournalService,
    private readonly auditLog: AuditLogService
  ) {}

  /** Creates the invoice as DRAFT — no GL impact yet. See post() for that. */
  async create(organizationId: string, companyId: string, userId: string, input: CreateInvoiceInput) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    await this.customers.getOneOrThrow(organizationId, companyId, input.customerId);

    const totals = calculateDocumentTotals(input.items);

    const invoice = await this.prisma.invoice.create({
      data: {
        organizationId,
        companyId,
        customerId: input.customerId,
        invoiceNumber: input.invoiceNumber,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        notes: input.notes,
        subtotalNgn: totals.subtotalNgn,
        vatAmountNgn: totals.vatAmountNgn,
        totalNgn: totals.totalNgn,
        items: {
          create: totals.lines.map((l) => ({
            description: l.description ?? "Item",
            quantity: l.quantity,
            unitPriceNgn: l.unitPriceNgn,
            vatRate: l.vatRate,
            lineTotalNgn: l.lineTotalNgn,
          })),
        },
      },
      include: { items: true },
    });

    await this.auditLog.record({
      organizationId,
      userId,
      action: "CREATE",
      objectType: "Invoice",
      objectId: invoice.id,
      newValue: { invoiceNumber: invoice.invoiceNumber, totalNgn: totals.totalNgn },
    });

    return invoice;
  }

  /**
   * Posts a DRAFT invoice to the general ledger: Dr Accounts Receivable (full total),
   * Cr Sales Revenue (subtotal), Cr VAT Payable (VAT amount, only if > 0 — a balanced
   * journal entry cannot contain a zero-amount line, per validateJournalLines).
   */
  async post(organizationId: string, companyId: string, userId: string, invoiceId: string) {
    const invoice = await this.getOneOrThrow(organizationId, companyId, invoiceId);
    if (invoice.status !== "DRAFT") {
      throw new BadRequestException(`Cannot post an invoice with status "${invoice.status}" — only DRAFT invoices can be posted.`);
    }

    const ar = await this.accounts.getByCodeOrThrow(organizationId, companyId, SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
    const revenue = await this.accounts.getByCodeOrThrow(organizationId, companyId, SYSTEM_ACCOUNT_CODES.SALES_REVENUE);

    const lines = [
      { accountId: ar.id, debitNgn: Number(invoice.totalNgn), creditNgn: 0, description: `Invoice ${invoice.invoiceNumber}` },
      { accountId: revenue.id, debitNgn: 0, creditNgn: Number(invoice.subtotalNgn), description: `Invoice ${invoice.invoiceNumber}` },
    ];
    if (Number(invoice.vatAmountNgn) > 0) {
      const vatPayable = await this.accounts.getByCodeOrThrow(organizationId, companyId, SYSTEM_ACCOUNT_CODES.VAT_PAYABLE);
      lines.push({ accountId: vatPayable.id, debitNgn: 0, creditNgn: Number(invoice.vatAmountNgn), description: `Invoice ${invoice.invoiceNumber} VAT` });
    }

    const entry = await this.journal.postEntry(organizationId, companyId, userId, {
      entryDate: invoice.issueDate,
      description: `Invoice ${invoice.invoiceNumber} to customer`,
      source: "INVOICE",
      sourceId: invoice.id,
      documentReference: invoice.invoiceNumber,
      lines,
    });

    const updated = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "SENT", journalEntryId: entry.id },
    });

    await this.auditLog.record({
      organizationId,
      userId,
      action: "POST",
      objectType: "Invoice",
      objectId: invoice.id,
      newValue: { journalEntryId: entry.id, status: "SENT" },
    });

    return updated;
  }

  /**
   * Records a customer payment against a posted invoice: Dr Cash/Bank, Cr Accounts
   * Receivable. Updates amountPaidNgn and flips status to PARTIALLY_PAID or PAID.
   */
  async recordPayment(organizationId: string, companyId: string, userId: string, invoiceId: string, amountNgn: number, paymentDate: Date, method?: string, reference?: string) {
    const invoice = await this.getOneOrThrow(organizationId, companyId, invoiceId);
    if (!["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status)) {
      throw new BadRequestException(`Cannot record a payment against an invoice with status "${invoice.status}".`);
    }
    const outstanding = Number(invoice.totalNgn) - Number(invoice.amountPaidNgn);
    if (amountNgn <= 0 || amountNgn > outstanding + 0.01) {
      throw new BadRequestException(`Payment amount must be > 0 and <= outstanding balance (₦${outstanding.toLocaleString()}).`);
    }

    const cash = await this.accounts.getByCodeOrThrow(organizationId, companyId, SYSTEM_ACCOUNT_CODES.CASH);
    const ar = await this.accounts.getByCodeOrThrow(organizationId, companyId, SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);

    const entry = await this.journal.postEntry(organizationId, companyId, userId, {
      entryDate: paymentDate,
      description: `Payment received for invoice ${invoice.invoiceNumber}`,
      source: "PAYMENT",
      sourceId: invoice.id,
      lines: [
        { accountId: cash.id, debitNgn: amountNgn, creditNgn: 0 },
        { accountId: ar.id, debitNgn: 0, creditNgn: amountNgn },
      ],
    });

    const newAmountPaid = Number(invoice.amountPaidNgn) + amountNgn;
    const newStatus = newAmountPaid >= Number(invoice.totalNgn) - 0.01 ? "PAID" : "PARTIALLY_PAID";

    const [, updatedInvoice] = await this.prisma.$transaction([
      this.prisma.accountingPayment.create({
        data: {
          organizationId,
          companyId,
          direction: "RECEIPT",
          amountNgn,
          paymentDate,
          method,
          reference,
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          journalEntryId: entry.id,
        },
      }),
      this.prisma.invoice.update({ where: { id: invoice.id }, data: { amountPaidNgn: newAmountPaid, status: newStatus } }),
    ]);

    return updatedInvoice;
  }

  async listForCompany(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.invoice.findMany({ where: { companyId }, include: { items: true }, orderBy: { issueDate: "desc" } });
  }

  async getOneOrThrow(organizationId: string, companyId: string, invoiceId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, include: { items: true } });
    if (!invoice || invoice.companyId !== companyId) throw new NotFoundException("Invoice not found.");
    return invoice;
  }
}

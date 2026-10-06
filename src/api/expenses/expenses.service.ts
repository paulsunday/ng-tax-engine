import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { SuppliersService } from "../suppliers/suppliers.service";
import { AccountsService } from "../accounts/accounts.service";
import { JournalService } from "../journal/journal.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { SYSTEM_ACCOUNT_CODES } from "../../accounting/defaultChartOfAccounts";

export interface ExpenseItemInput {
  accountId: string;
  description: string;
  amountNgn: number;
}

export interface CreateExpenseInput {
  supplierId?: string;
  expenseDate: Date;
  description: string;
  vatRate?: number; // resolved by the caller from the tax engine, same pattern as invoices
  items: ExpenseItemInput[];
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly suppliers: SuppliersService,
    private readonly accounts: AccountsService,
    private readonly journal: JournalService,
    private readonly auditLog: AuditLogService
  ) {}

  async create(organizationId: string, companyId: string, userId: string, input: CreateExpenseInput) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    if (input.supplierId) await this.suppliers.getOneOrThrow(organizationId, companyId, input.supplierId);
    if (input.items.length === 0) throw new BadRequestException("An expense must have at least one line item.");

    const subtotal = round2(input.items.reduce((acc, i) => acc + i.amountNgn, 0));
    const vatAmount = round2(subtotal * (input.vatRate ?? 0));
    const total = round2(subtotal + vatAmount);

    const expense = await this.prisma.expense.create({
      data: {
        organizationId,
        companyId,
        supplierId: input.supplierId,
        expenseDate: input.expenseDate,
        description: input.description,
        subtotalNgn: subtotal,
        vatAmountNgn: vatAmount,
        totalNgn: total,
        items: { create: input.items.map((i) => ({ accountId: i.accountId, description: i.description, amountNgn: i.amountNgn })) },
      },
      include: { items: true },
    });

    await this.auditLog.record({
      organizationId,
      userId,
      action: "CREATE",
      objectType: "Expense",
      objectId: expense.id,
      newValue: { description: expense.description, totalNgn: total },
    });

    return expense;
  }

  /** Dr each expense-account line (+ Dr VAT Recoverable if applicable), Cr Accounts Payable. */
  async post(organizationId: string, companyId: string, userId: string, expenseId: string) {
    const expense = await this.getOneOrThrow(organizationId, companyId, expenseId);
    if (expense.status !== "DRAFT") {
      throw new BadRequestException(`Cannot post an expense with status "${expense.status}" — only DRAFT expenses can be posted.`);
    }

    const ap = await this.accounts.getByCodeOrThrow(organizationId, companyId, SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE);

    const lines = expense.items.map((item) => ({
      accountId: item.accountId,
      debitNgn: Number(item.amountNgn),
      creditNgn: 0,
      description: item.description,
    }));

    if (Number(expense.vatAmountNgn) > 0) {
      const vatRecoverable = await this.accounts.getByCodeOrThrow(organizationId, companyId, SYSTEM_ACCOUNT_CODES.VAT_RECOVERABLE);
      lines.push({ accountId: vatRecoverable.id, debitNgn: Number(expense.vatAmountNgn), creditNgn: 0, description: `${expense.description} VAT` });
    }
    lines.push({ accountId: ap.id, debitNgn: 0, creditNgn: Number(expense.totalNgn), description: expense.description });

    const entry = await this.journal.postEntry(organizationId, companyId, userId, {
      entryDate: expense.expenseDate,
      description: expense.description,
      source: "EXPENSE",
      sourceId: expense.id,
      lines,
    });

    const updated = await this.prisma.expense.update({ where: { id: expense.id }, data: { status: "APPROVED", journalEntryId: entry.id } });

    await this.auditLog.record({
      organizationId,
      userId,
      action: "POST",
      objectType: "Expense",
      objectId: expense.id,
      newValue: { journalEntryId: entry.id, status: "APPROVED" },
    });

    return updated;
  }

  async recordPayment(organizationId: string, companyId: string, userId: string, expenseId: string, amountNgn: number, paymentDate: Date, method?: string, reference?: string) {
    const expense = await this.getOneOrThrow(organizationId, companyId, expenseId);
    if (expense.status !== "APPROVED" && expense.status !== "PAID") {
      throw new BadRequestException(`Cannot record a payment against an expense with status "${expense.status}" — it must be APPROVED (posted) first.`);
    }
    const outstanding = Number(expense.totalNgn) - Number(expense.amountPaidNgn);
    if (amountNgn <= 0 || amountNgn > outstanding + 0.01) {
      throw new BadRequestException(`Payment amount must be > 0 and <= outstanding balance (₦${outstanding.toLocaleString()}).`);
    }

    const ap = await this.accounts.getByCodeOrThrow(organizationId, companyId, SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE);
    const cash = await this.accounts.getByCodeOrThrow(organizationId, companyId, SYSTEM_ACCOUNT_CODES.CASH);

    const entry = await this.journal.postEntry(organizationId, companyId, userId, {
      entryDate: paymentDate,
      description: `Payment for expense: ${expense.description}`,
      source: "PAYMENT",
      sourceId: expense.id,
      lines: [
        { accountId: ap.id, debitNgn: amountNgn, creditNgn: 0 },
        { accountId: cash.id, debitNgn: 0, creditNgn: amountNgn },
      ],
    });

    const newAmountPaid = Number(expense.amountPaidNgn) + amountNgn;
    const newStatus = newAmountPaid >= Number(expense.totalNgn) - 0.01 ? "PAID" : "APPROVED";

    const [, updatedExpense] = await this.prisma.$transaction([
      this.prisma.accountingPayment.create({
        data: {
          organizationId,
          companyId,
          direction: "DISBURSEMENT",
          amountNgn,
          paymentDate,
          method,
          reference,
          expenseId: expense.id,
          supplierId: expense.supplierId,
          journalEntryId: entry.id,
        },
      }),
      this.prisma.expense.update({ where: { id: expense.id }, data: { amountPaidNgn: newAmountPaid, status: newStatus } }),
    ]);

    return updatedExpense;
  }

  async listForCompany(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.expense.findMany({ where: { companyId }, include: { items: true }, orderBy: { expenseDate: "desc" } });
  }

  async getOneOrThrow(organizationId: string, companyId: string, expenseId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const expense = await this.prisma.expense.findUnique({ where: { id: expenseId }, include: { items: true } });
    if (!expense || expense.companyId !== companyId) throw new NotFoundException("Expense not found.");
    return expense;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

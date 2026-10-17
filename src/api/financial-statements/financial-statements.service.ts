import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { JournalService } from "../journal/journal.service";
import {
  buildProfitAndLoss,
  buildBalanceSheet,
  buildAgingReport,
  buildStatementOfChangesInEquity,
  TrialBalanceRow,
} from "../../financial-statements/statementBuilder";

@Injectable()
export class FinancialStatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly journal: JournalService
  ) {}

  async getTrialBalance(organizationId: string, companyId: string, asOfDate?: Date) {
    return this.journal.getTrialBalance(organizationId, companyId, asOfDate);
  }

  async getProfitAndLoss(organizationId: string, companyId: string, periodStart: Date, periodEnd: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    // P&L is a FLOW over the period, not a point-in-time balance: get the trial balance as
    // of periodEnd and as of the instant before periodStart, then take the difference for
    // revenue/expense accounts so prior-period activity isn't double-counted (this engine
    // has no period-close journal yet — see the module docstring in statementBuilder.ts).
    const dayBeforeStart = new Date(periodStart);
    dayBeforeStart.setUTCDate(dayBeforeStart.getUTCDate() - 1);

    const [endBalance, startBalance] = await Promise.all([
      this.journal.getTrialBalance(organizationId, companyId, periodEnd),
      this.journal.getTrialBalance(organizationId, companyId, dayBeforeStart),
    ]);

    const startMap = new Map(startBalance.rows.map((r) => [r.accountId, r]));
    const periodRows: TrialBalanceRow[] = endBalance.rows.map((r) => {
      const prior = startMap.get(r.accountId);
      return {
        accountId: r.accountId,
        code: r.code,
        name: r.name,
        type: r.type as TrialBalanceRow["type"],
        debitNgn: r.debitNgn - (prior?.debitNgn ?? 0),
        creditNgn: r.creditNgn - (prior?.creditNgn ?? 0),
      };
    });

    return buildProfitAndLoss(periodRows.filter((r) => r.type === "REVENUE" || r.type === "EXPENSE"));
  }

  async getBalanceSheet(organizationId: string, companyId: string, asOfDate: Date, periodStartForProfit: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const [trialBalance, pnl] = await Promise.all([
      this.journal.getTrialBalance(organizationId, companyId, asOfDate),
      this.getProfitAndLoss(organizationId, companyId, periodStartForProfit, asOfDate),
    ]);
    return buildBalanceSheet(trialBalance.rows as TrialBalanceRow[], pnl.netProfitBeforeTaxNgn);
  }

  /**
   * The basic "capital account" roll-forward: opening capital + capital introduced -
   * drawings + net profit for the period = closing capital. Shares the same
   * start/end-trial-balance-difference approach as getProfitAndLoss, scoped to EQUITY
   * accounts instead of REVENUE/EXPENSE.
   */
  async getStatementOfChangesInEquity(organizationId: string, companyId: string, periodStart: Date, periodEnd: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const dayBeforeStart = new Date(periodStart);
    dayBeforeStart.setUTCDate(dayBeforeStart.getUTCDate() - 1);

    const [openingBalance, endBalance, pnl] = await Promise.all([
      this.journal.getTrialBalance(organizationId, companyId, dayBeforeStart),
      this.journal.getTrialBalance(organizationId, companyId, periodEnd),
      this.getProfitAndLoss(organizationId, companyId, periodStart, periodEnd),
    ]);

    const openingMap = new Map(openingBalance.rows.map((r) => [r.accountId, r]));
    const periodMovementRows: TrialBalanceRow[] = endBalance.rows
      .filter((r) => r.type === "EQUITY")
      .map((r) => {
        const prior = openingMap.get(r.accountId);
        return {
          accountId: r.accountId,
          code: r.code,
          name: r.name,
          type: r.type as TrialBalanceRow["type"],
          debitNgn: r.debitNgn - (prior?.debitNgn ?? 0),
          creditNgn: r.creditNgn - (prior?.creditNgn ?? 0),
        };
      });

    return buildStatementOfChangesInEquity(
      openingBalance.rows.filter((r) => r.type === "EQUITY") as TrialBalanceRow[],
      periodMovementRows,
      pnl.netProfitBeforeTaxNgn
    );
  }

  async getArAging(organizationId: string, companyId: string, asOfDate: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
      include: { customer: true },
    });
    return buildAgingReport(
      invoices.map((inv) => ({
        id: inv.id,
        partyName: inv.customer.name,
        dueDate: inv.dueDate,
        outstandingNgn: Number(inv.totalNgn) - Number(inv.amountPaidNgn),
      })),
      asOfDate
    );
  }

  async getApAging(organizationId: string, companyId: string, asOfDate: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const expenses = await this.prisma.expense.findMany({
      where: { companyId, status: "APPROVED" },
      include: { supplier: true },
    });
    return buildAgingReport(
      expenses.map((exp) => ({
        id: exp.id,
        partyName: exp.supplier?.name ?? "(no supplier)",
        dueDate: exp.expenseDate, // Expense has no separate due date field yet — uses expense date as a simplification
        outstandingNgn: Number(exp.totalNgn) - Number(exp.amountPaidNgn),
      })),
      asOfDate
    );
  }

  /**
   * Simplified direct-method cash summary: net Cash/Bank movement grouped by the
   * JournalEntrySource that caused it. This is NOT a full indirect-method statement of
   * cash flows classified into Operating/Investing/Financing — that requires transaction
   * metadata this engine doesn't capture yet. Documented as a scoped simplification, not
   * claimed as a complete IAS 7-style statement.
   */
  async getCashMovementSummary(organizationId: string, companyId: string, cashAccountId: string, periodStart: Date, periodEnd: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId: cashAccountId,
        journalEntry: { companyId, status: "POSTED", entryDate: { gte: periodStart, lte: periodEnd } },
      },
      include: { journalEntry: true },
    });

    const bySource = new Map<string, number>();
    for (const line of lines) {
      const net = Number(line.debitNgn) - Number(line.creditNgn);
      bySource.set(line.journalEntry.source, round2((bySource.get(line.journalEntry.source) ?? 0) + net));
    }

    const netCashMovementNgn = round2([...bySource.values()].reduce((a, v) => a + v, 0));
    return { bySource: Object.fromEntries(bySource), netCashMovementNgn };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

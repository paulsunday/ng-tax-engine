/**
 * Pure financial-statement construction from trial-balance rows (framework-agnostic, same
 * pattern as src/engine/* and src/accounting/*). Statements are never persisted/snapshotted
 * — Phase 2's rule that a POSTED JournalEntry is immutable means re-deriving a statement
 * for the same period always gives the same answer, so there is nothing to snapshot.
 *
 * Classification convention (an application-design choice, not a cited rule, since this
 * is OUR OWN chart of accounts from defaultChartOfAccounts.ts): within EXPENSE-type
 * accounts, a code starting with "5" is Cost of Sales; everything else is an operating
 * expense. This is documented here precisely so it's never mistaken for a tax-law rule.
 */

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  debitNgn: number;
  creditNgn: number;
}

export interface StatementLine {
  accountId: string;
  code: string;
  name: string;
  amountNgn: number;
}

export interface ProfitAndLoss {
  revenue: StatementLine[];
  totalRevenueNgn: number;
  costOfSales: StatementLine[];
  totalCostOfSalesNgn: number;
  grossProfitNgn: number;
  operatingExpenses: StatementLine[];
  totalOperatingExpensesNgn: number;
  netProfitBeforeTaxNgn: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Revenue and liability/equity accounts are credit-normal; naturalBalance flips the sign so a "normal" balance always reports as positive. */
function naturalBalance(row: TrialBalanceRow): number {
  const creditNormal = row.type === "REVENUE" || row.type === "LIABILITY" || row.type === "EQUITY";
  return creditNormal ? round2(row.creditNgn - row.debitNgn) : round2(row.debitNgn - row.creditNgn);
}

export function buildProfitAndLoss(rows: TrialBalanceRow[]): ProfitAndLoss {
  const revenueRows = rows.filter((r) => r.type === "REVENUE");
  const expenseRows = rows.filter((r) => r.type === "EXPENSE");
  const costOfSalesRows = expenseRows.filter((r) => r.code.startsWith("5"));
  const operatingExpenseRows = expenseRows.filter((r) => !r.code.startsWith("5"));

  const toLine = (r: TrialBalanceRow): StatementLine => ({ accountId: r.accountId, code: r.code, name: r.name, amountNgn: naturalBalance(r) });

  const revenue = revenueRows.map(toLine);
  const costOfSales = costOfSalesRows.map(toLine);
  const operatingExpenses = operatingExpenseRows.map(toLine);

  const totalRevenueNgn = round2(revenue.reduce((a, l) => a + l.amountNgn, 0));
  const totalCostOfSalesNgn = round2(costOfSales.reduce((a, l) => a + l.amountNgn, 0));
  const totalOperatingExpensesNgn = round2(operatingExpenses.reduce((a, l) => a + l.amountNgn, 0));
  const grossProfitNgn = round2(totalRevenueNgn - totalCostOfSalesNgn);
  const netProfitBeforeTaxNgn = round2(grossProfitNgn - totalOperatingExpensesNgn);

  return {
    revenue,
    totalRevenueNgn,
    costOfSales,
    totalCostOfSalesNgn,
    grossProfitNgn,
    operatingExpenses,
    totalOperatingExpensesNgn,
    netProfitBeforeTaxNgn,
  };
}

export interface BalanceSheet {
  assets: StatementLine[];
  totalAssetsNgn: number;
  liabilities: StatementLine[];
  totalLiabilitiesNgn: number;
  equity: StatementLine[];
  currentPeriodProfitNgn: number;
  totalEquityNgn: number; // includes currentPeriodProfitNgn folded in as unappropriated retained earnings
  isBalanced: boolean; // Assets == Liabilities + Equity
}

/**
 * currentPeriodProfitNgn must be supplied by the caller (from buildProfitAndLoss on the
 * SAME period) because revenue/expense accounts are period-flushed in conventional
 * bookkeeping closing entries — this engine doesn't implement period-close journals yet,
 * so the P&L result is folded into equity here rather than assumed to already be a
 * Retained Earnings account balance.
 */
export function buildBalanceSheet(rows: TrialBalanceRow[], currentPeriodProfitNgn: number): BalanceSheet {
  const toLine = (r: TrialBalanceRow): StatementLine => ({ accountId: r.accountId, code: r.code, name: r.name, amountNgn: naturalBalance(r) });

  const assets = rows.filter((r) => r.type === "ASSET").map(toLine);
  const liabilities = rows.filter((r) => r.type === "LIABILITY").map(toLine);
  const equity = rows.filter((r) => r.type === "EQUITY").map(toLine);

  const totalAssetsNgn = round2(assets.reduce((a, l) => a + l.amountNgn, 0));
  const totalLiabilitiesNgn = round2(liabilities.reduce((a, l) => a + l.amountNgn, 0));
  const equityExclProfitNgn = round2(equity.reduce((a, l) => a + l.amountNgn, 0));
  const totalEquityNgn = round2(equityExclProfitNgn + currentPeriodProfitNgn);

  return {
    assets,
    totalAssetsNgn,
    liabilities,
    totalLiabilitiesNgn,
    equity,
    currentPeriodProfitNgn: round2(currentPeriodProfitNgn),
    totalEquityNgn,
    isBalanced: Math.abs(totalAssetsNgn - (totalLiabilitiesNgn + totalEquityNgn)) < 0.01,
  };
}

export interface AgingBucket {
  label: "CURRENT" | "DAYS_1_30" | "DAYS_31_60" | "DAYS_61_90" | "DAYS_90_PLUS";
  amountNgn: number;
}

export interface AgingItem {
  id: string;
  partyName: string;
  dueDate: Date;
  outstandingNgn: number;
}

export function buildAgingReport(items: AgingItem[], asOfDate: Date): { buckets: AgingBucket[]; items: (AgingItem & { daysOverdue: number; bucket: AgingBucket["label"] })[] } {
  const bucketTotals: Record<AgingBucket["label"], number> = {
    CURRENT: 0,
    DAYS_1_30: 0,
    DAYS_31_60: 0,
    DAYS_61_90: 0,
    DAYS_90_PLUS: 0,
  };

  const detailed = items.map((item) => {
    const daysOverdue = Math.floor((asOfDate.getTime() - item.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    let bucket: AgingBucket["label"];
    if (daysOverdue <= 0) bucket = "CURRENT";
    else if (daysOverdue <= 30) bucket = "DAYS_1_30";
    else if (daysOverdue <= 60) bucket = "DAYS_31_60";
    else if (daysOverdue <= 90) bucket = "DAYS_61_90";
    else bucket = "DAYS_90_PLUS";

    bucketTotals[bucket] = round2(bucketTotals[bucket] + item.outstandingNgn);
    return { ...item, daysOverdue, bucket };
  });

  const buckets: AgingBucket[] = (Object.keys(bucketTotals) as AgingBucket["label"][]).map((label) => ({ label, amountNgn: bucketTotals[label] }));

  return { buckets, items: detailed };
}

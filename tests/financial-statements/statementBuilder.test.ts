import {
  buildProfitAndLoss,
  buildBalanceSheet,
  buildAgingReport,
  buildStatementOfChangesInEquity,
  TrialBalanceRow,
} from "../../src/financial-statements/statementBuilder";
import { SYSTEM_ACCOUNT_CODES } from "../../src/accounting/defaultChartOfAccounts";

function row(overrides: Partial<TrialBalanceRow>): TrialBalanceRow {
  return { accountId: "a", code: "0000", name: "X", type: "ASSET", debitNgn: 0, creditNgn: 0, ...overrides };
}

describe("buildProfitAndLoss", () => {
  test("computes gross profit and net profit before tax correctly", () => {
    const rows: TrialBalanceRow[] = [
      row({ accountId: "rev", code: "4000", name: "Sales Revenue", type: "REVENUE", creditNgn: 1_000_000 }),
      row({ accountId: "cos", code: "5000", name: "Cost of Sales", type: "EXPENSE", debitNgn: 400_000 }),
      row({ accountId: "rent", code: "6100", name: "Rent", type: "EXPENSE", debitNgn: 100_000 }),
      row({ accountId: "sal", code: "6000", name: "Salaries", type: "EXPENSE", debitNgn: 200_000 }),
    ];
    const pnl = buildProfitAndLoss(rows);

    expect(pnl.totalRevenueNgn).toBe(1_000_000);
    expect(pnl.totalCostOfSalesNgn).toBe(400_000);
    expect(pnl.grossProfitNgn).toBe(600_000);
    expect(pnl.totalOperatingExpensesNgn).toBe(300_000);
    expect(pnl.netProfitBeforeTaxNgn).toBe(300_000);
  });

  test("handles a loss-making period (negative net profit)", () => {
    const rows: TrialBalanceRow[] = [
      row({ accountId: "rev", code: "4000", type: "REVENUE", creditNgn: 100_000 }),
      row({ accountId: "sal", code: "6000", type: "EXPENSE", debitNgn: 250_000 }),
    ];
    const pnl = buildProfitAndLoss(rows);
    expect(pnl.netProfitBeforeTaxNgn).toBe(-150_000);
  });

  test("a revenue account with an abnormal debit balance (e.g. a large credit note) still nets correctly", () => {
    const rows: TrialBalanceRow[] = [row({ accountId: "rev", code: "4000", type: "REVENUE", debitNgn: 50_000, creditNgn: 30_000 })];
    const pnl = buildProfitAndLoss(rows);
    expect(pnl.totalRevenueNgn).toBe(-20_000); // credit-normal: credit - debit
  });
});

describe("buildBalanceSheet", () => {
  test("balances when assets equal liabilities + equity + current period profit", () => {
    const rows: TrialBalanceRow[] = [
      row({ accountId: "cash", code: "1000", type: "ASSET", debitNgn: 800_000 }),
      row({ accountId: "ap", code: "2000", type: "LIABILITY", creditNgn: 500_000 }),
      row({ accountId: "capital", code: "3000", type: "EQUITY", creditNgn: 0 }),
    ];
    const bs = buildBalanceSheet(rows, 300_000);

    expect(bs.totalAssetsNgn).toBe(800_000);
    expect(bs.totalLiabilitiesNgn).toBe(500_000);
    expect(bs.totalEquityNgn).toBe(300_000);
    expect(bs.isBalanced).toBe(true);
  });

  test("flags isBalanced=false when the ledger genuinely does not balance (should never happen if posting is correct, but must be detectable)", () => {
    const rows: TrialBalanceRow[] = [
      row({ accountId: "cash", code: "1000", type: "ASSET", debitNgn: 800_000 }),
      row({ accountId: "ap", code: "2000", type: "LIABILITY", creditNgn: 500_000 }),
    ];
    const bs = buildBalanceSheet(rows, 0); // no profit folded in, so 800k assets vs 500k liabilities+equity
    expect(bs.isBalanced).toBe(false);
  });
});

describe("buildAgingReport", () => {
  test("buckets items correctly by days overdue", () => {
    const asOf = new Date("2026-07-01");
    const { buckets, items } = buildAgingReport(
      [
        { id: "1", partyName: "A", dueDate: new Date("2026-07-05"), outstandingNgn: 1000 }, // not yet due -> CURRENT
        { id: "2", partyName: "B", dueDate: new Date("2026-06-20"), outstandingNgn: 2000 }, // 11 days overdue
        { id: "3", partyName: "C", dueDate: new Date("2026-04-01"), outstandingNgn: 3000 }, // 91 days overdue
      ],
      asOf
    );

    expect(items[0].bucket).toBe("CURRENT");
    expect(items[1].bucket).toBe("DAYS_1_30");
    expect(items[2].bucket).toBe("DAYS_90_PLUS");
    expect(buckets.find((b) => b.label === "DAYS_90_PLUS")?.amountNgn).toBe(3000);
  });

  test("an item due exactly today is CURRENT, not overdue", () => {
    const asOf = new Date("2026-07-01");
    const { items } = buildAgingReport([{ id: "1", partyName: "A", dueDate: new Date("2026-07-01"), outstandingNgn: 500 }], asOf);
    expect(items[0].bucket).toBe("CURRENT");
  });
});

describe("buildStatementOfChangesInEquity", () => {
  test("rolls forward opening capital + capital introduced - drawings + net profit = closing capital", () => {
    const opening: TrialBalanceRow[] = [row({ accountId: "capital", code: "3000", name: "Share Capital", type: "EQUITY", creditNgn: 1_000_000 })];
    const periodMovement: TrialBalanceRow[] = [
      row({ accountId: "capital", code: "3000", name: "Share Capital", type: "EQUITY", creditNgn: 200_000 }), // capital introduced this period
      row({ accountId: "drawings", code: SYSTEM_ACCOUNT_CODES.DRAWINGS, name: "Drawings", type: "EQUITY", debitNgn: 50_000 }), // owner withdrawal
    ];

    const stmt = buildStatementOfChangesInEquity(opening, periodMovement, 300_000);

    expect(stmt.openingCapitalNgn).toBe(1_000_000);
    expect(stmt.capitalIntroducedNgn).toBe(200_000);
    expect(stmt.drawingsNgn).toBe(50_000);
    expect(stmt.netProfitNgn).toBe(300_000);
    expect(stmt.closingCapitalNgn).toBe(1_450_000); // 1,000,000 + 200,000 - 50,000 + 300,000
  });

  test("a net loss for the period reduces closing capital", () => {
    const opening: TrialBalanceRow[] = [row({ accountId: "capital", code: "3000", name: "Share Capital", type: "EQUITY", creditNgn: 500_000 })];
    const stmt = buildStatementOfChangesInEquity(opening, [], -100_000);
    expect(stmt.closingCapitalNgn).toBe(400_000);
  });

  test("drawings are tracked separately from other equity movements, not netted together", () => {
    const periodMovement: TrialBalanceRow[] = [
      row({ accountId: "drawings", code: SYSTEM_ACCOUNT_CODES.DRAWINGS, name: "Drawings", type: "EQUITY", debitNgn: 20_000 }),
    ];
    const stmt = buildStatementOfChangesInEquity([], periodMovement, 0);
    expect(stmt.drawingsNgn).toBe(20_000);
    expect(stmt.capitalIntroducedNgn).toBe(0);
    expect(stmt.byAccount.find((a) => a.code === SYSTEM_ACCOUNT_CODES.DRAWINGS)?.amountNgn).toBe(20_000);
  });
});

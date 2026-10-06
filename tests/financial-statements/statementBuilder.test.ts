import { buildProfitAndLoss, buildBalanceSheet, buildAgingReport, TrialBalanceRow } from "../../src/financial-statements/statementBuilder";

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

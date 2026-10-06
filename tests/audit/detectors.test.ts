import {
  detectDuplicateTransactions,
  detectMissingDocumentation,
  detectLargeTransactions,
  detectRoundNumberAnomalies,
  detectRepeatedCounterparty,
  detectPeriodCutoffIssues,
  checkTaxConsistency,
  checkLedgerBalance,
  TransactionLike,
} from "../../src/audit/detectors";

function txn(overrides: Partial<TransactionLike>): TransactionLike {
  return {
    id: "t1",
    entityType: "Expense",
    amountNgn: 10000,
    date: new Date("2026-06-01"),
    counterpartyId: "supplier-1",
    counterpartyName: "Acme",
    hasDocument: true,
    createdAt: new Date("2026-06-01"),
    ...overrides,
  };
}

describe("detectDuplicateTransactions", () => {
  test("flags two same-amount, same-counterparty transactions within the window", () => {
    const findings = detectDuplicateTransactions([
      txn({ id: "a", amountNgn: 50000, date: new Date("2026-06-01") }),
      txn({ id: "b", amountNgn: 50000, date: new Date("2026-06-03") }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe("DUPLICATE_TRANSACTION");
  });

  test("does not flag same amount with DIFFERENT counterparties", () => {
    const findings = detectDuplicateTransactions([
      txn({ id: "a", amountNgn: 50000, counterpartyId: "supplier-1" }),
      txn({ id: "b", amountNgn: 50000, counterpartyId: "supplier-2" }),
    ]);
    expect(findings).toHaveLength(0);
  });

  test("does not flag same counterparty+amount outside the time window", () => {
    const findings = detectDuplicateTransactions(
      [txn({ id: "a", amountNgn: 50000, date: new Date("2026-06-01") }), txn({ id: "b", amountNgn: 50000, date: new Date("2026-07-01") })],
      7
    );
    expect(findings).toHaveLength(0);
  });

  test("uses neutral, non-accusatory language", () => {
    const findings = detectDuplicateTransactions([txn({ id: "a", amountNgn: 50000 }), txn({ id: "b", amountNgn: 50000, date: new Date("2026-06-02") })]);
    expect(findings[0].description.toLowerCase()).not.toMatch(/fraud|theft|steal|criminal/);
    expect(findings[0].description).toMatch(/potential|requires review/i);
  });
});

describe("detectMissingDocumentation", () => {
  test("flags only transactions without a linked document", () => {
    const findings = detectMissingDocumentation([txn({ id: "a", hasDocument: false }), txn({ id: "b", hasDocument: true })]);
    expect(findings).toHaveLength(1);
    expect(findings[0].relatedEntityId).toBe("a");
  });
});

describe("detectLargeTransactions", () => {
  test("flags a transaction well above the median, given a reasonable sample size", () => {
    const transactions = [10000, 12000, 9000, 11000, 10500, 500000].map((amountNgn, i) => txn({ id: `t${i}`, amountNgn }));
    const findings = detectLargeTransactions(transactions);
    expect(findings).toHaveLength(1);
    expect(findings[0].relatedEntityId).toBe("t5");
  });

  test("does nothing with too small a sample to be statistically meaningful", () => {
    const transactions = [10000, 500000].map((amountNgn, i) => txn({ id: `t${i}`, amountNgn }));
    expect(detectLargeTransactions(transactions)).toHaveLength(0);
  });
});

describe("detectRoundNumberAnomalies", () => {
  test("flags a large, exactly-round amount", () => {
    const findings = detectRoundNumberAnomalies([txn({ id: "a", amountNgn: 500000 })]);
    expect(findings).toHaveLength(1);
  });

  test("does not flag a small round amount below the materiality threshold", () => {
    const findings = detectRoundNumberAnomalies([txn({ id: "a", amountNgn: 1000 })]);
    expect(findings).toHaveLength(0);
  });

  test("does not flag a large but non-round amount", () => {
    const findings = detectRoundNumberAnomalies([txn({ id: "a", amountNgn: 537421 })]);
    expect(findings).toHaveLength(0);
  });
});

describe("detectRepeatedCounterparty", () => {
  test("flags a counterparty responsible for an outsized share of transactions", () => {
    const transactions = [
      txn({ id: "1", counterpartyId: "sup-1" }),
      txn({ id: "2", counterpartyId: "sup-1" }),
      txn({ id: "3", counterpartyId: "sup-1" }),
      txn({ id: "4", counterpartyId: "sup-2" }),
      txn({ id: "5", counterpartyId: "sup-3" }),
    ];
    const findings = detectRepeatedCounterparty(transactions, 0.4, 5);
    expect(findings).toHaveLength(1);
    expect(findings[0].relatedEntityId).toBe("sup-1");
  });

  test("does not flag an evenly distributed set of counterparties", () => {
    const transactions = ["sup-1", "sup-2", "sup-3", "sup-4", "sup-5"].map((id, i) => txn({ id: `t${i}`, counterpartyId: id }));
    expect(detectRepeatedCounterparty(transactions, 0.4, 5)).toHaveLength(0);
  });
});

describe("detectPeriodCutoffIssues", () => {
  test("flags a transaction recorded well after its stated date", () => {
    const findings = detectPeriodCutoffIssues([txn({ id: "a", date: new Date("2026-01-01"), createdAt: new Date("2026-03-15") })]);
    expect(findings).toHaveLength(1);
  });

  test("does not flag a transaction recorded promptly", () => {
    const findings = detectPeriodCutoffIssues([txn({ id: "a", date: new Date("2026-01-01"), createdAt: new Date("2026-01-02") })]);
    expect(findings).toHaveLength(0);
  });
});

describe("checkTaxConsistency", () => {
  test("flags a material mismatch between invoiced VAT and the VAT Payable account", () => {
    expect(checkTaxConsistency(100000, 90000)).toHaveLength(1);
  });

  test("does not flag amounts within tolerance", () => {
    expect(checkTaxConsistency(100000, 100000.5)).toHaveLength(0);
  });
});

describe("checkLedgerBalance", () => {
  test("flags a genuinely unbalanced ledger as HIGH severity", () => {
    const findings = checkLedgerBalance(1000, 900);
    expect(findings[0].severity).toBe("HIGH");
  });

  test("a balanced ledger produces no finding", () => {
    expect(checkLedgerBalance(1000, 1000)).toHaveLength(0);
  });
});

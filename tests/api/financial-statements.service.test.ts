import { FinancialStatementsService } from "../../src/api/financial-statements/financial-statements.service";

function makeMocks() {
  const prisma: any = {
    invoice: { findMany: jest.fn().mockResolvedValue([]) },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
    journalLine: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const journal: any = { getTrialBalance: jest.fn() };
  return { prisma, companies, journal };
}

describe("FinancialStatementsService.getProfitAndLoss", () => {
  test("takes the DIFFERENCE between end-of-period and start-of-period trial balances, not the raw end balance", async () => {
    const { prisma, companies, journal } = makeMocks();
    // Prior-period activity already in the ledger before periodStart:
    journal.getTrialBalance
      .mockResolvedValueOnce({
        rows: [{ accountId: "rev", code: "4000", name: "Sales Revenue", type: "REVENUE", debitNgn: 0, creditNgn: 500_000 }],
      }) // end of period (cumulative)
      .mockResolvedValueOnce({
        rows: [{ accountId: "rev", code: "4000", name: "Sales Revenue", type: "REVENUE", debitNgn: 0, creditNgn: 300_000 }],
      }); // day before period start (prior cumulative)

    const service = new FinancialStatementsService(prisma, companies, journal);
    const pnl = await service.getProfitAndLoss("org-1", "company-1", new Date("2026-06-01"), new Date("2026-06-30"));

    // Only the IN-PERIOD revenue (500k - 300k = 200k) should show, not the full cumulative 500k.
    expect(pnl.totalRevenueNgn).toBe(200_000);
  });
});

describe("FinancialStatementsService.getStatementOfChangesInEquity", () => {
  test("combines opening equity, in-period equity movement, and net profit for the SAME period", async () => {
    const { prisma, companies, journal } = makeMocks();
    journal.getTrialBalance
      .mockResolvedValueOnce({
        rows: [{ accountId: "capital", code: "3000", name: "Share Capital", type: "EQUITY", debitNgn: 0, creditNgn: 1_000_000 }],
      }) // opening (day before periodStart)
      .mockResolvedValueOnce({
        rows: [{ accountId: "capital", code: "3000", name: "Share Capital", type: "EQUITY", debitNgn: 0, creditNgn: 1_200_000 }],
      }) // end of period (cumulative)
      .mockResolvedValueOnce({ rows: [] }) // getProfitAndLoss's own end-of-period call
      .mockResolvedValueOnce({ rows: [] }); // getProfitAndLoss's own start-of-period call

    const service = new FinancialStatementsService(prisma, companies, journal);
    const stmt = await service.getStatementOfChangesInEquity("org-1", "company-1", new Date("2026-06-01"), new Date("2026-06-30"));

    expect(stmt.openingCapitalNgn).toBe(1_000_000);
    expect(stmt.capitalIntroducedNgn).toBe(200_000); // 1,200,000 - 1,000,000 introduced this period
    expect(stmt.closingCapitalNgn).toBe(1_200_000); // no net profit in this fixture, so closing = opening + introduced
  });
});

describe("FinancialStatementsService aging reports", () => {
  test("getArAging only includes outstanding (unpaid) invoices, using (total - amountPaid)", async () => {
    const { prisma, companies, journal } = makeMocks();
    prisma.invoice.findMany.mockResolvedValue([
      { id: "inv-1", totalNgn: "100000", amountPaidNgn: "40000", dueDate: new Date("2026-06-01"), customer: { name: "Acme" } },
    ]);
    const service = new FinancialStatementsService(prisma, companies, journal);

    const result = await service.getArAging("org-1", "company-1", new Date("2026-07-01"));
    expect(result.items[0].outstandingNgn).toBe(60_000);
  });
});

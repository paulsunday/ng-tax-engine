import { MatchingService } from "../../src/api/bank-import/matching.service";

function makeMocks() {
  const prisma: any = {
    bankTransaction: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    accountingPayment: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const auditLog: any = { record: jest.fn() };
  return { prisma, companies, auditLog };
}

describe("MatchingService.matchTransaction", () => {
  test("auto-matches when exactly one payment of the same amount/direction exists within the date window", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.bankTransaction.findUnique.mockResolvedValue({
      id: "txn-1",
      companyId: "company-1",
      creditNgn: "107500",
      debitNgn: "0",
      transactionDate: new Date("2026-06-20"),
    });
    prisma.accountingPayment.findMany.mockResolvedValue([
      { id: "pay-1", amountNgn: "107500", paymentDate: new Date("2026-06-18"), direction: "RECEIPT" },
    ]);
    prisma.bankTransaction.update.mockResolvedValue({ id: "txn-1", matchStatus: "MATCHED" });

    const service = new MatchingService(prisma, companies, auditLog);
    const result = await service.matchTransaction("org-1", "company-1", "txn-1");

    expect(result.autoMatched).toBe(true);
    expect(prisma.bankTransaction.update).toHaveBeenCalledWith({
      where: { id: "txn-1" },
      data: { matchStatus: "MATCHED", matchedEntityType: "AccountingPayment", matchedEntityId: "pay-1", matchConfidence: "EXACT" },
    });
  });

  test("does NOT auto-match a merely plausible (non-exact) candidate — surfaces it for manual review instead", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.bankTransaction.findUnique.mockResolvedValue({
      id: "txn-1",
      companyId: "company-1",
      creditNgn: "100000",
      debitNgn: "0",
      transactionDate: new Date("2026-06-20"),
    });
    prisma.accountingPayment.findMany.mockResolvedValue([
      { id: "pay-1", amountNgn: "100500", paymentDate: new Date("2026-06-19"), direction: "RECEIPT" }, // close but not exact
    ]);

    const service = new MatchingService(prisma, companies, auditLog);
    const result = await service.matchTransaction("org-1", "company-1", "txn-1");

    expect(result.autoMatched).toBe(false);
    expect(result.candidates[0].confidence).toBe("LIKELY");
    expect(prisma.bankTransaction.update).not.toHaveBeenCalled();
  });

  test("a debit (money out) only matches DISBURSEMENT-direction payments, never RECEIPT", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.bankTransaction.findUnique.mockResolvedValue({
      id: "txn-1",
      companyId: "company-1",
      creditNgn: "0",
      debitNgn: "50000",
      transactionDate: new Date("2026-06-20"),
    });

    const service = new MatchingService(prisma, companies, auditLog);
    await service.matchTransaction("org-1", "company-1", "txn-1");

    expect(prisma.accountingPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ direction: "DISBURSEMENT" }) })
    );
  });

  test("a payment wildly different in amount is not even returned as a LIKELY candidate", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.bankTransaction.findUnique.mockResolvedValue({
      id: "txn-1",
      companyId: "company-1",
      creditNgn: "100000",
      debitNgn: "0",
      transactionDate: new Date("2026-06-20"),
    });
    prisma.accountingPayment.findMany.mockResolvedValue([
      { id: "pay-1", amountNgn: "5000000", paymentDate: new Date("2026-06-19"), direction: "RECEIPT" },
    ]);

    const service = new MatchingService(prisma, companies, auditLog);
    const result = await service.matchTransaction("org-1", "company-1", "txn-1");

    expect(result.candidates).toHaveLength(0);
  });
});

describe("MatchingService.unmatch", () => {
  test("refuses to unmatch a transaction already locked into a completed reconciliation", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.bankTransaction.findUnique.mockResolvedValue({ id: "txn-1", companyId: "company-1", reconciliationId: "recon-1" });

    const service = new MatchingService(prisma, companies, auditLog);
    await expect(service.unmatch("org-1", "company-1", "user-1", "txn-1")).rejects.toThrow(/reconciliation/i);
  });
});

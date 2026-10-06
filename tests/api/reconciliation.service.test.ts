import { BadRequestException } from "@nestjs/common";
import { ReconciliationService } from "../../src/api/reconciliation/reconciliation.service";

function makeMocks() {
  const prisma: any = {
    reconciliation: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    bankTransaction: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    accountingPayment: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const bankAccounts: any = { getOneOrThrow: jest.fn() };
  const journal: any = { getTrialBalance: jest.fn() };
  const auditLog: any = { record: jest.fn() };
  return { prisma, companies, bankAccounts, journal, auditLog };
}

describe("ReconciliationService.start", () => {
  test("refuses to start when the bank account has no linked GL account", async () => {
    const { prisma, companies, bankAccounts, journal, auditLog } = makeMocks();
    bankAccounts.getOneOrThrow.mockResolvedValue({ id: "bank-1", glAccountId: null });
    const service = new ReconciliationService(prisma, companies, bankAccounts, journal, auditLog);

    await expect(
      service.start("org-1", "company-1", "user-1", {
        bankAccountId: "bank-1",
        periodLabel: "June 2026",
        statementEndDate: new Date("2026-06-30"),
        statementBalanceNgn: 500000,
      })
    ).rejects.toThrow(BadRequestException);
  });

  test("snapshots the ledger balance (debit - credit) from the trial balance at the statement date", async () => {
    const { prisma, companies, bankAccounts, journal, auditLog } = makeMocks();
    bankAccounts.getOneOrThrow.mockResolvedValue({ id: "bank-1", glAccountId: "gl-cash" });
    journal.getTrialBalance.mockResolvedValue({
      rows: [{ accountId: "gl-cash", code: "1000", name: "Cash", type: "ASSET", debitNgn: 600000, creditNgn: 100000 }],
      totalDebit: 600000,
      totalCredit: 600000,
      isBalanced: true,
    });
    prisma.reconciliation.create.mockResolvedValue({ id: "recon-1", companyId: "company-1", bankAccountId: "bank-1", statementEndDate: new Date("2026-06-30"), statementBalanceNgn: "500000", ledgerBalanceNgn: "500000" });
    prisma.reconciliation.findUnique.mockResolvedValue({ id: "recon-1", companyId: "company-1", bankAccountId: "bank-1", statementEndDate: new Date("2026-06-30"), statementBalanceNgn: "500000", ledgerBalanceNgn: "500000" });

    const service = new ReconciliationService(prisma, companies, bankAccounts, journal, auditLog);
    await service.start("org-1", "company-1", "user-1", {
      bankAccountId: "bank-1",
      periodLabel: "June 2026",
      statementEndDate: new Date("2026-06-30"),
      statementBalanceNgn: 500000,
    });

    expect(prisma.reconciliation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ledgerBalanceNgn: 500000 }) }) // 600,000 - 100,000
    );
  });
});

describe("ReconciliationService.getSummary", () => {
  test("computes balanceDifference as statement minus ledger, and totals outstanding items correctly", async () => {
    const { prisma, companies, bankAccounts, journal, auditLog } = makeMocks();
    prisma.reconciliation.findUnique.mockResolvedValue({
      id: "recon-1",
      companyId: "company-1",
      bankAccountId: "bank-1",
      statementEndDate: new Date("2026-06-30"),
      statementBalanceNgn: "510000",
      ledgerBalanceNgn: "500000",
    });
    prisma.bankTransaction.findMany
      .mockResolvedValueOnce([]) // matchedPaymentIds lookup
      .mockResolvedValueOnce([{ id: "txn-unmatched-1" }]); // unmatchedBankTransactions
    prisma.accountingPayment.findMany
      .mockResolvedValueOnce([{ id: "pay-1", amountNgn: "7000" }]) // outstanding deposits
      .mockResolvedValueOnce([{ id: "pay-2", amountNgn: "3000" }]); // outstanding payments

    const service = new ReconciliationService(prisma, companies, bankAccounts, journal, auditLog);
    const summary = await service.getSummary("org-1", "company-1", "recon-1");

    expect(summary.balanceDifference).toBe(10000); // 510,000 - 500,000
    expect(summary.outstandingDepositsTotal).toBe(7000);
    expect(summary.outstandingPaymentsTotal).toBe(3000);
    expect(summary.unmatchedBankTransactions).toHaveLength(1);
  });
});

describe("ReconciliationService.complete", () => {
  test("refuses to complete a reconciliation that is already COMPLETED", async () => {
    const { prisma, companies, bankAccounts, journal, auditLog } = makeMocks();
    prisma.reconciliation.findUnique.mockResolvedValue({ id: "recon-1", companyId: "company-1", status: "COMPLETED" });
    const service = new ReconciliationService(prisma, companies, bankAccounts, journal, auditLog);

    await expect(service.complete("org-1", "company-1", "user-1", "recon-1")).rejects.toThrow(BadRequestException);
  });

  test("links matched bank transactions to the reconciliation and marks it COMPLETED", async () => {
    const { prisma, companies, bankAccounts, journal, auditLog } = makeMocks();
    prisma.reconciliation.findUnique.mockResolvedValue({ id: "recon-1", companyId: "company-1", status: "IN_PROGRESS", bankAccountId: "bank-1", statementEndDate: new Date("2026-06-30") });
    prisma.bankTransaction.findMany.mockResolvedValue([{ id: "txn-1" }, { id: "txn-2" }]);
    prisma.reconciliation.update.mockResolvedValue({ id: "recon-1", status: "COMPLETED" });

    const service = new ReconciliationService(prisma, companies, bankAccounts, journal, auditLog);
    await service.complete("org-1", "company-1", "user-1", "recon-1");

    expect(prisma.bankTransaction.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["txn-1", "txn-2"] } }, data: { reconciliationId: "recon-1" } });
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: "COMPLETE" }));
  });
});

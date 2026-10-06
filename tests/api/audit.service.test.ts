import { AuditService } from "../../src/api/audit/audit.service";

function makeMocks() {
  const prisma: any = {
    auditRun: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    auditFinding: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    invoice: { findMany: jest.fn().mockResolvedValue([]) },
    expense: { findMany: jest.fn().mockResolvedValue([]) },
    bankTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    document: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (arr: any[]) => Promise.all(arr)),
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const journal: any = { getTrialBalance: jest.fn().mockResolvedValue({ rows: [], totalDebit: 1000, totalCredit: 1000, isBalanced: true }) };
  const auditLog: any = { record: jest.fn() };
  return { prisma, companies, journal, auditLog };
}

describe("AuditService.runNormalAudit", () => {
  test("creates an AuditRun, stores findings, and marks it COMPLETED on success", async () => {
    const { prisma, companies, journal, auditLog } = makeMocks();
    prisma.auditRun.create.mockResolvedValue({ id: "run-1" });
    prisma.invoice.findMany.mockResolvedValue([
      { id: "inv-1", totalNgn: "600000", vatAmountNgn: "0", issueDate: new Date("2026-06-01"), createdAt: new Date("2026-06-01"), customerId: "c1", customer: { name: "Acme" } },
    ]);
    prisma.auditRun.update.mockResolvedValue({ id: "run-1", status: "COMPLETED" });
    prisma.auditRun.findUnique.mockResolvedValue({ id: "run-1", companyId: "company-1", status: "COMPLETED", findings: [] });

    const service = new AuditService(prisma, companies, journal, auditLog);
    await service.runNormalAudit("org-1", "company-1", "user-1", new Date("2026-06-01"), new Date("2026-06-30"));

    expect(prisma.auditRun.create).toHaveBeenCalled();
    expect(prisma.auditRun.update).toHaveBeenCalledWith({ where: { id: "run-1" }, data: { status: "COMPLETED", completedAt: expect.any(Date) } });
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: "RUN_AUDIT" }));
  });

  test("marks the run FAILED (not COMPLETED) if finding collection throws", async () => {
    const { prisma, companies, journal, auditLog } = makeMocks();
    prisma.auditRun.create.mockResolvedValue({ id: "run-1" });
    journal.getTrialBalance.mockRejectedValue(new Error("DB exploded"));
    prisma.auditRun.update.mockResolvedValue({ id: "run-1", status: "FAILED" });

    const service = new AuditService(prisma, companies, journal, auditLog);
    await expect(service.runNormalAudit("org-1", "company-1", "user-1", new Date("2026-06-01"), new Date("2026-06-30"))).rejects.toThrow("DB exploded");

    expect(prisma.auditRun.update).toHaveBeenCalledWith({ where: { id: "run-1" }, data: { status: "FAILED" } });
  });

  test("flags an unreconciled bank transaction found in the period", async () => {
    const { prisma, companies, journal, auditLog } = makeMocks();
    prisma.auditRun.create.mockResolvedValue({ id: "run-1" });
    prisma.bankTransaction.findMany.mockResolvedValue([
      { id: "txn-1", matchStatus: "UNMATCHED", transactionDate: new Date("2026-06-15"), narration: "Unknown transfer" },
    ]);
    prisma.auditRun.update.mockResolvedValue({ id: "run-1", status: "COMPLETED" });
    prisma.auditRun.findUnique.mockResolvedValue({ id: "run-1", companyId: "company-1", status: "COMPLETED", findings: [{ category: "UNRECONCILED_BANK_TRANSACTION" }] });

    const service = new AuditService(prisma, companies, journal, auditLog);
    await service.runNormalAudit("org-1", "company-1", "user-1", new Date("2026-06-01"), new Date("2026-06-30"));

    const createdCategories = prisma.auditFinding.create.mock.calls.map((c: any) => c[0].data.category);
    expect(createdCategories).toContain("UNRECONCILED_BANK_TRANSACTION");
  });
});

describe("AuditService.resolveFinding", () => {
  test("updates status and resolution notes, and logs the action", async () => {
    const { prisma, companies, journal, auditLog } = makeMocks();
    prisma.auditFinding.findUnique.mockResolvedValue({ id: "finding-1", auditRun: { companyId: "company-1" } });
    prisma.auditFinding.update.mockResolvedValue({ id: "finding-1", status: "RESOLVED" });

    const service = new AuditService(prisma, companies, journal, auditLog);
    await service.resolveFinding("org-1", "company-1", "user-1", "finding-1", "RESOLVED", "Confirmed legitimate, same invoice re-sent.");

    expect(prisma.auditFinding.update).toHaveBeenCalledWith({
      where: { id: "finding-1" },
      data: { status: "RESOLVED", resolutionNotes: "Confirmed legitimate, same invoice re-sent." },
    });
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: "RESOLVE_FINDING" }));
  });
});

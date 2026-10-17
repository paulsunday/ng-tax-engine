import { BadRequestException, NotFoundException } from "@nestjs/common";
import { JournalService } from "../../src/api/journal/journal.service";
import { UnbalancedJournalEntryError } from "../../src/accounting/doubleEntry";

function makeMocks() {
  const prisma: any = {
    account: { findMany: jest.fn(), findUnique: jest.fn() },
    journalEntry: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    journalLine: { findMany: jest.fn() },
    $transaction: jest.fn(async (fnOrArray: any) => {
      if (typeof fnOrArray === "function") return fnOrArray(prisma);
      return Promise.all(fnOrArray);
    }),
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1", organizationId: "org-1" }) };
  const auditLog: any = { record: jest.fn() };
  return { prisma, companies, auditLog };
}

describe("JournalService.postEntry", () => {
  test("verifies the company belongs to the caller's organization before posting", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    companies.getOneOrThrow.mockRejectedValue(new NotFoundException("Company not found."));
    const service = new JournalService(prisma, companies, auditLog);

    await expect(
      service.postEntry("org-1", "company-1", "user-1", {
        entryDate: new Date(),
        description: "Test",
        source: "MANUAL",
        lines: [
          { accountId: "a1", debitNgn: 100, creditNgn: 0 },
          { accountId: "a2", debitNgn: 0, creditNgn: 100 },
        ],
      })
    ).rejects.toThrow(NotFoundException);
  });

  test("rejects an unbalanced entry BEFORE touching the database at all", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    const service = new JournalService(prisma, companies, auditLog);

    await expect(
      service.postEntry("org-1", "company-1", "user-1", {
        entryDate: new Date(),
        description: "Bad entry",
        source: "MANUAL",
        lines: [
          { accountId: "a1", debitNgn: 100, creditNgn: 0 },
          { accountId: "a2", debitNgn: 0, creditNgn: 50 },
        ],
      })
    ).rejects.toThrow(UnbalancedJournalEntryError);

    expect(prisma.account.findMany).not.toHaveBeenCalled();
    expect(prisma.journalEntry.create).not.toHaveBeenCalled();
  });

  test("rejects posting against an account that does not belong to this company", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.account.findMany.mockResolvedValue([{ id: "a1" }]); // only one of the two accountIds resolved
    const service = new JournalService(prisma, companies, auditLog);

    await expect(
      service.postEntry("org-1", "company-1", "user-1", {
        entryDate: new Date(),
        description: "Test",
        source: "MANUAL",
        lines: [
          { accountId: "a1", debitNgn: 100, creditNgn: 0 },
          { accountId: "a2-from-another-company", debitNgn: 0, creditNgn: 100 },
        ],
      })
    ).rejects.toThrow(BadRequestException);
  });

  test("posts a balanced, valid entry and records an audit log entry", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.account.findMany.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
    prisma.journalEntry.create.mockResolvedValue({ id: "entry-1", description: "Sale", source: "MANUAL", lines: [{}, {}] });
    const service = new JournalService(prisma, companies, auditLog);

    const result = await service.postEntry("org-1", "company-1", "user-1", {
      entryDate: new Date("2026-06-01"),
      description: "Sale",
      source: "MANUAL",
      lines: [
        { accountId: "a1", debitNgn: 1000, creditNgn: 0 },
        { accountId: "a2", debitNgn: 0, creditNgn: 1000 },
      ],
    });

    expect(result.id).toBe("entry-1");
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: "POST", objectType: "JournalEntry" }));
  });
});

describe("JournalService.voidEntry", () => {
  test("refuses to void an entry that is not POSTED", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.journalEntry.findUnique.mockResolvedValue({ id: "e1", companyId: "company-1", status: "DRAFT", lines: [] });
    const service = new JournalService(prisma, companies, auditLog);

    await expect(service.voidEntry("org-1", "company-1", "user-1", "e1", "mistake")).rejects.toThrow(BadRequestException);
  });

  test("refuses to void an entry belonging to a different company (tenant isolation)", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.journalEntry.findUnique.mockResolvedValue({ id: "e1", companyId: "OTHER-company", status: "POSTED", lines: [] });
    const service = new JournalService(prisma, companies, auditLog);

    await expect(service.voidEntry("org-1", "company-1", "user-1", "e1", "mistake")).rejects.toThrow(NotFoundException);
  });

  test("posts a reversal entry with swapped debit/credit and flips the original to VOID", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    const originalLines = [
      { accountId: "cash", debitNgn: "1000", creditNgn: "0", description: "Sale" },
      { accountId: "revenue", debitNgn: "0", creditNgn: "1000", description: "Sale" },
    ];
    prisma.journalEntry.findUnique.mockResolvedValue({ id: "e1", companyId: "company-1", status: "POSTED", description: "Sale", lines: originalLines });
    prisma.journalEntry.create.mockImplementation(async ({ data }: any) => ({ id: "reversal-1", ...data, lines: data.lines.create }));

    const service = new JournalService(prisma, companies, auditLog);
    const reversal = await service.voidEntry("org-1", "company-1", "user-1", "e1", "data entry error");

    expect(reversal.reversalOfId).toBe("e1");
    expect(reversal.lines[0]).toMatchObject({ accountId: "cash", debitNgn: 0, creditNgn: 1000 });
    expect(reversal.lines[1]).toMatchObject({ accountId: "revenue", debitNgn: 1000, creditNgn: 0 });
    expect(prisma.journalEntry.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { status: "VOID" } });
  });
});

describe("JournalService.getTrialBalance", () => {
  test("aggregates debits/credits per account and confirms the trial balance balances", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.journalLine.findMany.mockResolvedValue([
      { accountId: "cash", debitNgn: "1000", creditNgn: "0", account: { code: "1000", name: "Cash", type: "ASSET" } },
      { accountId: "revenue", debitNgn: "0", creditNgn: "1000", account: { code: "4000", name: "Revenue", type: "REVENUE" } },
      { accountId: "cash", debitNgn: "500", creditNgn: "0", account: { code: "1000", name: "Cash", type: "ASSET" } },
      { accountId: "revenue", debitNgn: "0", creditNgn: "500", account: { code: "4000", name: "Revenue", type: "REVENUE" } },
    ]);
    const service = new JournalService(prisma, companies, auditLog);

    const result = await service.getTrialBalance("org-1", "company-1");

    expect(result.totalDebit).toBe(1500);
    expect(result.totalCredit).toBe(1500);
    expect(result.isBalanced).toBe(true);
    expect(result.rows.find((r) => r.code === "1000")?.debitNgn).toBe(1500);
  });
});

describe("JournalService.getAccountLedger", () => {
  test("rejects an account that does not belong to this company (tenant isolation)", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.account.findUnique.mockResolvedValue({ id: "a1", companyId: "OTHER-company", type: "ASSET" });
    const service = new JournalService(prisma, companies, auditLog);

    await expect(service.getAccountLedger("org-1", "company-1", "a1")).rejects.toThrow(NotFoundException);
  });

  test("computes a running balance in date order, debit-normal for an ASSET account", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.account.findUnique.mockResolvedValue({ id: "cash", companyId: "company-1", code: "1000", name: "Cash", type: "ASSET" });
    prisma.journalLine.findMany.mockResolvedValue([
      {
        journalEntryId: "e2",
        debitNgn: "0",
        creditNgn: "300",
        journalEntry: { entryDate: new Date("2026-06-02"), description: "Pay rent", source: "MANUAL" },
      },
      {
        journalEntryId: "e1",
        debitNgn: "1000",
        creditNgn: "0",
        journalEntry: { entryDate: new Date("2026-06-01"), description: "Opening sale", source: "MANUAL" },
      },
    ]);
    const service = new JournalService(prisma, companies, auditLog);

    const ledger = await service.getAccountLedger("org-1", "company-1", "cash");

    expect(ledger.entries.map((e) => e.journalEntryId)).toEqual(["e1", "e2"]); // sorted by entryDate, not query order
    expect(ledger.entries[0].runningBalanceNgn).toBe(1000);
    expect(ledger.entries[1].runningBalanceNgn).toBe(700);
    expect(ledger.closingBalanceNgn).toBe(700);
  });

  test("a credit-normal (EQUITY) account's balance moves up on a credit, down on a debit", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.account.findUnique.mockResolvedValue({ id: "drawings", companyId: "company-1", code: "3200", name: "Drawings", type: "EQUITY" });
    prisma.journalLine.findMany.mockResolvedValue([
      {
        journalEntryId: "e1",
        debitNgn: "50000",
        creditNgn: "0",
        journalEntry: { entryDate: new Date("2026-06-01"), description: "Owner withdrawal", source: "MANUAL" },
      },
    ]);
    const service = new JournalService(prisma, companies, auditLog);

    const ledger = await service.getAccountLedger("org-1", "company-1", "drawings");

    expect(ledger.closingBalanceNgn).toBe(-50000); // debit against a credit-normal account
  });

  test("carries in an opening balance from before periodStart, excluded from the period's own entries", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.account.findUnique.mockResolvedValue({ id: "cash", companyId: "company-1", code: "1000", name: "Cash", type: "ASSET" });
    prisma.journalLine.findMany
      .mockResolvedValueOnce([{ debitNgn: "1000", creditNgn: "0" }]) // prior-period lines (opening balance)
      .mockResolvedValueOnce([
        { journalEntryId: "e2", debitNgn: "200", creditNgn: "0", journalEntry: { entryDate: new Date("2026-06-15"), description: "In-period sale", source: "MANUAL" } },
      ]);
    const service = new JournalService(prisma, companies, auditLog);

    const ledger = await service.getAccountLedger("org-1", "company-1", "cash", new Date("2026-06-01"), new Date("2026-06-30"));

    expect(ledger.openingBalanceNgn).toBe(1000);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.closingBalanceNgn).toBe(1200);
  });
});

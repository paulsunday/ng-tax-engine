import { WhtDeterminationService } from "../../src/api/wht-determination/wht-determination.service";

function makeMocks() {
  const prisma: any = {
    businessTransaction: { aggregate: jest.fn().mockResolvedValue({ _sum: { grossAmountNgn: null } }), create: jest.fn(), findMany: jest.fn() },
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const rules: any = {
    getEffectiveRule: jest.fn().mockReturnValue({
      id: "rule-wht",
      value: [{ transaction: "commission_consultancy_technical_management_professional_fees", resident_corporate: 0.05, nonresident_corporate: 0.1, resident_noncorporate: 0.05, nonresident_noncorporate: 0.1 }],
    }),
    tryGetEffectiveRule: jest.fn().mockReturnValue(null), // exempt-categories / small-supplier lookups resolve to "not found" -> skipped branches
  };
  return { prisma, companies, rules };
}

function mockCreateWithNestedInclude(prisma: any, txnId: string) {
  prisma.businessTransaction.create.mockImplementation(async ({ data }: any) => {
    const { whtDetermination, ...rest } = data;
    return { id: txnId, ...rest, whtDetermination: whtDetermination?.create ?? null };
  });
}

describe("WhtDeterminationService.recordAndDetermine", () => {
  test("computes and persists a WHT determination for a resident-corporate professional-fee transaction", async () => {
    const { prisma, companies, rules } = makeMocks();
    mockCreateWithNestedInclude(prisma, "txn-1");
    const service = new WhtDeterminationService(prisma, companies, rules);

    const result = await service.recordAndDetermine(
      "org-1",
      "company-1",
      {
        counterpartyName: "Acme Consulting",
        counterpartyTin: "TIN-ACME-001",
        counterpartyIsCorporate: true,
        counterpartyIsResident: true,
        transactionCategory: "commission_consultancy_technical_management_professional_fees",
        grossAmountNgn: 1_000_000,
        transactionDate: new Date("2026-06-15"),
      },
      false,
      new Date("2026-06-15")
    );

    expect(result.whtDetermination!.rateApplied).toBeCloseTo(0.05);
    expect(result.whtDetermination!.whtAmountNgn).toBe(50_000);
  });

  test("includes prior transactions with the SAME counterparty THIS MONTH in the cumulative-value check", async () => {
    const { prisma, companies, rules } = makeMocks();
    prisma.businessTransaction.aggregate.mockResolvedValue({ _sum: { grossAmountNgn: "1500000" } });
    prisma.businessTransaction.create.mockImplementation(async ({ data }: any) => ({ id: "txn-2", ...data }));
    const service = new WhtDeterminationService(prisma, companies, rules);

    await service.recordAndDetermine(
      "org-1",
      "company-1",
      {
        counterpartyName: "Repeat Vendor",
        counterpartyIsCorporate: true,
        counterpartyIsResident: true,
        transactionCategory: "commission_consultancy_technical_management_professional_fees",
        grossAmountNgn: 600_000,
        transactionDate: new Date("2026-06-20"),
      },
      false,
      new Date("2026-06-20")
    );

    expect(prisma.businessTransaction.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ counterpartyName: "Repeat Vendor" }) })
    );
  });
});

describe("WhtDeterminationService.getTotalWhtForPeriod", () => {
  test("sums WHT amounts across all transactions in the period", async () => {
    const { prisma } = makeMocks();
    prisma.businessTransaction.findMany.mockResolvedValue([
      { whtDetermination: { whtAmountNgn: "50000" } },
      { whtDetermination: { whtAmountNgn: "30000" } },
      { whtDetermination: null },
    ]);
    const service = new WhtDeterminationService(prisma, { getOneOrThrow: jest.fn() } as any, { getEffectiveRule: jest.fn() } as any);

    const total = await service.getTotalWhtForPeriod("company-1", new Date("2026-06-01"), new Date("2026-06-30"));
    expect(total).toBe(80_000);
  });
});

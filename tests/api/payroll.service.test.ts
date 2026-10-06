import { PayrollService } from "../../src/api/payroll/payroll.service";

function makeMocks() {
  const prisma: any = {
    employee: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    payeCalculation: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const rules: any = {
    getEffectiveRule: jest.fn((key: string) => {
      if (key === "rent_relief") return { id: "r1", value: { percentage_of_annual_rent: 0.2, cap_ngn: 500000, apply: "lower_of" } };
      if (key === "paye_tax_bands")
        return {
          id: "r2",
          value: [
            { band_order: 1, amount_ngn: 800000, type: "first", rate: 0 },
            { band_order: 2, amount_ngn: 2200000, type: "next", rate: 0.15 },
            { band_order: 3, amount_ngn: 9000000, type: "next", rate: 0.18 },
            { band_order: 4, amount_ngn: 13000000, type: "next", rate: 0.21 },
            { band_order: 5, amount_ngn: 25000000, type: "next", rate: 0.23 },
            { band_order: 6, amount_ngn: null, type: "above_cumulative_50000000", rate: 0.25 },
          ],
        };
      throw new Error(`unexpected rule key ${key}`);
    }),
  };
  return { prisma, companies, rules };
}

describe("PayrollService.runPayeForEmployee", () => {
  test("uses the employee's OWN state of residence for jurisdiction, not the caller's assumption", async () => {
    const { prisma, companies, rules } = makeMocks();
    prisma.employee.findUnique.mockResolvedValue({ id: "emp-1", companyId: "company-1", stateOfResidenceCode: "KN" });
    prisma.payeCalculation.create.mockImplementation(async ({ data }: any) => ({ id: "calc-1", ...data }));
    const service = new PayrollService(prisma, companies, rules);

    const { relevantTaxAuthority } = await service.runPayeForEmployee(
      "org-1",
      "company-1",
      "emp-1",
      { periodMonth: 6, periodYear: 2026, grossEmolumentNgn: 2_000_000 },
      new Date("2026-06-30")
    );

    expect(relevantTaxAuthority).toMatch(/KN/);
    expect(relevantTaxAuthority).not.toMatch(/LA|EN|FC/); // not the caller's company HQ state, not any other state
  });

  test("persists a PayeCalculation row with the computed taxable income and tax payable", async () => {
    const { prisma, companies, rules } = makeMocks();
    prisma.employee.findUnique.mockResolvedValue({ id: "emp-1", companyId: "company-1", stateOfResidenceCode: "LA" });
    prisma.payeCalculation.create.mockImplementation(async ({ data }: any) => ({ id: "calc-1", ...data }));
    const service = new PayrollService(prisma, companies, rules);

    await service.runPayeForEmployee("org-1", "company-1", "emp-1", { periodMonth: 6, periodYear: 2026, grossEmolumentNgn: 6_000_000, annualRentNgn: 1_200_000 }, new Date("2026-06-30"));

    const createArgs = prisma.payeCalculation.create.mock.calls[0][0].data;
    expect(createArgs.reliefAppliedNgn).toBe(240_000); // 20% of 1.2m
    expect(createArgs.taxableIncomeNgn).toBe(5_760_000);
  });
});

describe("PayrollService.getTotalPayeForPeriod", () => {
  test("sums taxPayableNgn across all employees for the period", async () => {
    const { prisma } = makeMocks();
    prisma.payeCalculation.findMany.mockResolvedValue([{ taxPayableNgn: "50000" }, { taxPayableNgn: "25000" }]);
    const service = new PayrollService(prisma, { getOneOrThrow: jest.fn() } as any, { getEffectiveRule: jest.fn() } as any);

    const total = await service.getTotalPayeForPeriod("company-1", 6, 2026);
    expect(total).toBe(75_000);
  });
});

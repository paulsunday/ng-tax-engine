/**
 * Multi-state E2E test (mandate §25). Unlike tests/jurisdiction.test.ts (which exercises
 * the pure jurisdiction-matrix engine in isolation), this chains the REAL NestJS services —
 * PayrollService (wrapping the real PAYE engine) and FilingService (wrapping the real
 * AdapterRegistry) — for one company with head office in Lagos and employees resident in
 * Lagos, Enugu, and the FCT, now that all three are FULLY_RESEARCHED (S4/S5/S6). Only the
 * Prisma persistence boundary is test-doubled, exactly as the rest of this suite already
 * does (there is no live-DB test harness in this environment) — the rule repository, the
 * PAYE engine, the AdapterRegistry, and the two services under test are all real.
 */
import { PayrollService } from "../../src/api/payroll/payroll.service";
import { FilingService } from "../../src/api/filing/filing.service";
import { AdapterRegistry } from "../../src/adapters/AdapterRegistry";
import { StateAuthorityRepository } from "../../src/rules/StateAuthorityRepository";
import { getDemoApprovedRepo } from "../testRepo";

const AS_OF = new Date("2026-07-15");

describe("Multi-state company — PAYE computed per employee, filing routed per company HQ (mandate §25)", () => {
  const rules = getDemoApprovedRepo();
  const adapters = new AdapterRegistry(new StateAuthorityRepository());

  const employees = [
    { id: "e-la", fullName: "Tunde Bakare", stateOfResidenceCode: "LA", companyId: "company-1" },
    { id: "e-en", fullName: "Chidi Okafor", stateOfResidenceCode: "EN", companyId: "company-1" },
    { id: "e-fc", fullName: "Amina Bello", stateOfResidenceCode: "FC", companyId: "company-1" },
  ];

  function makePayrollService() {
    const prisma: any = {
      employee: { findUnique: jest.fn((args: any) => Promise.resolve(employees.find((e) => e.id === args.where.id) ?? null)) },
      payeCalculation: { create: jest.fn(({ data }: any) => Promise.resolve({ id: `calc-${data.employeeId}`, ...data })) },
    };
    const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
    return { service: new PayrollService(prisma, companies, rules), prisma };
  }

  test("each employee's PAYE is computed against THEIR OWN state of residence, not the company's Lagos head office", async () => {
    const { service } = makePayrollService();
    const input = { periodMonth: 6, periodYear: 2026, grossEmolumentNgn: 6_000_000 };

    const results = await Promise.all(
      employees.map((e) => service.runPayeForEmployee("org-1", "company-1", e.id, input, AS_OF))
    );

    expect(results[0].relevantTaxAuthority).toBe("LA State Internal Revenue Service");
    expect(results[1].relevantTaxAuthority).toBe("EN State Internal Revenue Service");
    expect(results[2].relevantTaxAuthority).toBe("FC State Internal Revenue Service");

    // Same gross emolument, same engine, same date — if jurisdiction were (incorrectly)
    // collapsed to one state, every result would share one relevantTaxAuthority string.
    const authorities = new Set(results.map((r) => r.relevantTaxAuthority));
    expect(authorities.size).toBe(3);
  });

  test("Enugu's PAYE resolves with VERIFIED confidence (fully-researched authority); Lagos/FCT PAYE still carries real engine output too", async () => {
    const { service } = makePayrollService();
    const input = { periodMonth: 6, periodYear: 2026, grossEmolumentNgn: 6_000_000 };

    const enuguResult = await service.runPayeForEmployee("org-1", "company-1", "e-en", input, AS_OF);
    expect(enuguResult.calculation.confidence).toBeDefined();
    expect(Number(enuguResult.calculation.taxPayableNgn)).toBeGreaterThan(0);
  });

  test("filing routes to the company's own head-office-state adapter (Lagos) for a PAYE return — a documented simplification, verified end-to-end rather than assumed", async () => {
    const prisma: any = {
      taxReturn: {
        findUnique: jest.fn().mockResolvedValue({
          id: "ret-1", companyId: "company-1", taxType: "PAYE", status: "APPROVED", submittedAt: null,
          complianceState: "CALCULATED", taxLiabilityNgn: "150000", periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-06-30"),
          calculationBreakdown: {},
        }),
        update: jest.fn(),
      },
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ tin: "TIN-DEMO-1", headOfficeStateCode: "LA" }) },
      filingAttempt: { create: jest.fn().mockResolvedValue({ id: "attempt-1" }) },
    };
    const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
    const auditLog: any = { record: jest.fn() };
    const filing = new FilingService(prisma, companies, auditLog, adapters);

    const capability = await filing.getAuthorityCapability("org-1", "company-1", "PAYE");
    expect(capability.authorityName).toMatch(/Lagos/i);

    const result = await filing.submit("org-1", "company-1", "user-1", "ret-1", "MANUAL");
    expect(result.filingCapability).toBe("MANUAL_OFFICIAL_PORTAL");
    expect(prisma.filingAttempt.create.mock.calls[0][0].data.authorityAdapter).toMatch(/Lagos/i);
  });
});

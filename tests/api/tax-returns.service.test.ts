import { BadRequestException } from "@nestjs/common";
import { TaxReturnsService } from "../../src/api/tax-returns/tax-returns.service";

function makeMocks() {
  const prisma: any = {
    taxReturn: { findUnique: jest.fn(), update: jest.fn() },
    company: { findUniqueOrThrow: jest.fn() },
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const auditLog: any = { record: jest.fn() };
  return { prisma, companies, auditLog };
}

function baseReturn(overrides: Partial<any> = {}) {
  return {
    id: "ret-1",
    companyId: "company-1",
    status: "DRAFT",
    confidence: "VERIFIED_CALCULATION",
    complianceState: "CALCULATED",
    taxLiabilityNgn: "100000",
    periodStart: new Date("2026-06-01"),
    periodEnd: new Date("2026-06-30"),
    payments: [],
    filingAttempts: [],
    complianceEntry: null,
    ...overrides,
  };
}

describe("TaxReturnsService.validate", () => {
  test("fails validation when the company has no TIN, and does NOT flip status to VALIDATED", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.taxReturn.findUnique.mockResolvedValue(baseReturn());
    prisma.company.findUniqueOrThrow.mockResolvedValue({ tin: null });
    const service = new TaxReturnsService(prisma, companies, auditLog);

    const result = await service.validate("org-1", "company-1", "user-1", "ret-1");

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("TIN"))).toBe(true);
    expect(prisma.taxReturn.update).not.toHaveBeenCalled();
  });

  test("fails validation when confidence is MISSING_REGULATORY_INFORMATION (unapproved rule) — never files on an unverified calculation", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.taxReturn.findUnique.mockResolvedValue(baseReturn({ confidence: "MISSING_REGULATORY_INFORMATION" }));
    prisma.company.findUniqueOrThrow.mockResolvedValue({ tin: "TIN-1" });
    const service = new TaxReturnsService(prisma, companies, auditLog);

    const result = await service.validate("org-1", "company-1", "user-1", "ret-1");
    expect(result.valid).toBe(false);
  });

  test("fails validation when complianceState is not CALCULATED, even if confidence looks fine — there is no real number to file", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.taxReturn.findUnique.mockResolvedValue(baseReturn({ complianceState: "PENDING_RULE_APPROVAL", taxLiabilityNgn: null }));
    prisma.company.findUniqueOrThrow.mockResolvedValue({ tin: "TIN-1" });
    const service = new TaxReturnsService(prisma, companies, auditLog);

    const result = await service.validate("org-1", "company-1", "user-1", "ret-1");

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("PENDING_RULE_APPROVAL"))).toBe(true);
    expect(prisma.taxReturn.update).not.toHaveBeenCalled();
  });

  test("passes validation and flips status to VALIDATED when everything checks out", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.taxReturn.findUnique.mockResolvedValue(baseReturn());
    prisma.company.findUniqueOrThrow.mockResolvedValue({ tin: "TIN-1" });
    const service = new TaxReturnsService(prisma, companies, auditLog);

    const result = await service.validate("org-1", "company-1", "user-1", "ret-1");

    expect(result.valid).toBe(true);
    expect(prisma.taxReturn.update).toHaveBeenCalledWith({ where: { id: "ret-1" }, data: { status: "VALIDATED" } });
  });
});

describe("TaxReturnsService.approve", () => {
  test("refuses to approve a return that isn't VALIDATED", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.taxReturn.findUnique.mockResolvedValue(baseReturn({ status: "DRAFT" }));
    const service = new TaxReturnsService(prisma, companies, auditLog);

    await expect(service.approve("org-1", "company-1", "user-1", "ret-1")).rejects.toThrow(BadRequestException);
  });

  test("approves a VALIDATED return", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.taxReturn.findUnique.mockResolvedValue(baseReturn({ status: "VALIDATED" }));
    prisma.taxReturn.update.mockResolvedValue({ id: "ret-1", status: "APPROVED" });
    const service = new TaxReturnsService(prisma, companies, auditLog);

    const result = await service.approve("org-1", "company-1", "user-1", "ret-1");
    expect(result.status).toBe("APPROVED");
  });
});

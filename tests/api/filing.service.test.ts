import { BadRequestException } from "@nestjs/common";
import { FilingService } from "../../src/api/filing/filing.service";

function makeMocks() {
  const prisma: any = {
    taxReturn: { findUnique: jest.fn(), update: jest.fn() },
    company: { findUniqueOrThrow: jest.fn() },
    filingAttempt: { create: jest.fn(), findMany: jest.fn() },
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const auditLog: any = { record: jest.fn() };
  const adapter = {
    authorityName: "Nigeria Revenue Service (NRS)",
    supportsAutomaticSubmission: false,
    filingCapability: "MANUAL_OFFICIAL_PORTAL",
    paymentCapability: "MANUAL_OFFICIAL_PORTAL",
    validateReturn: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
    submitReturn: jest.fn().mockResolvedValue({ succeeded: false, errorClass: "VALIDATION", rawResponse: { reason: "no API" } }),
  };
  const adapters: any = { get: jest.fn().mockReturnValue(adapter) };
  return { prisma, companies, auditLog, adapters, adapter };
}

function approvedReturn(overrides: Partial<any> = {}) {
  return { id: "ret-1", companyId: "company-1", taxType: "VAT", status: "APPROVED", submittedAt: null, taxLiabilityNgn: "50000", complianceState: "CALCULATED", periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-06-30"), calculationBreakdown: {}, ...overrides };
}

describe("FilingService.submit", () => {
  test("refuses to submit a return that isn't APPROVED", async () => {
    const { prisma, companies, auditLog, adapters } = makeMocks();
    prisma.taxReturn.findUnique.mockResolvedValue(approvedReturn({ status: "DRAFT" }));
    prisma.company.findUniqueOrThrow.mockResolvedValue({ tin: "TIN-1", headOfficeStateCode: "EN" });
    const service = new FilingService(prisma, companies, auditLog, adapters);

    await expect(service.submit("org-1", "company-1", "user-1", "ret-1", "MANUAL")).rejects.toThrow(BadRequestException);
  });

  test("refuses to submit a return that has already been submitted (no duplicate filings)", async () => {
    const { prisma, companies, auditLog, adapters } = makeMocks();
    prisma.taxReturn.findUnique.mockResolvedValue(approvedReturn({ submittedAt: new Date() }));
    prisma.company.findUniqueOrThrow.mockResolvedValue({ tin: "TIN-1", headOfficeStateCode: "EN" });
    const service = new FilingService(prisma, companies, auditLog, adapters);

    await expect(service.submit("org-1", "company-1", "user-1", "ret-1", "MANUAL")).rejects.toThrow(/duplicate/i);
  });

  test("refuses to submit when the company has no TIN", async () => {
    const { prisma, companies, auditLog, adapters } = makeMocks();
    prisma.taxReturn.findUnique.mockResolvedValue(approvedReturn());
    prisma.company.findUniqueOrThrow.mockResolvedValue({ tin: null, headOfficeStateCode: "EN" });
    const service = new FilingService(prisma, companies, auditLog, adapters);

    await expect(service.submit("org-1", "company-1", "user-1", "ret-1", "MANUAL")).rejects.toThrow(BadRequestException);
  });

  test("a failed submission (no real API) does NOT mark the return as FILED — status stays APPROVED", async () => {
    const { prisma, companies, auditLog, adapters } = makeMocks();
    prisma.taxReturn.findUnique.mockResolvedValue(approvedReturn());
    prisma.company.findUniqueOrThrow.mockResolvedValue({ tin: "TIN-1", headOfficeStateCode: "EN" });
    const service = new FilingService(prisma, companies, auditLog, adapters);

    const result = await service.submit("org-1", "company-1", "user-1", "ret-1", "MANUAL");

    expect(result.succeeded).toBe(false);
    expect(prisma.taxReturn.update).not.toHaveBeenCalled();
  });

  test("routes PAYE to the company's head-office-state adapter, everything else to FEDERAL", async () => {
    const { prisma, companies, auditLog, adapters } = makeMocks();
    prisma.taxReturn.findUnique.mockResolvedValue(approvedReturn({ taxType: "PAYE" }));
    prisma.company.findUniqueOrThrow.mockResolvedValue({ tin: "TIN-1", headOfficeStateCode: "EN" });
    const service = new FilingService(prisma, companies, auditLog, adapters);

    await service.submit("org-1", "company-1", "user-1", "ret-1", "MANUAL");
    expect(adapters.get).toHaveBeenCalledWith("EN");
  });

  test("marks a return FILED only when the adapter genuinely succeeds", async () => {
    const { prisma, companies, auditLog, adapters, adapter } = makeMocks();
    adapter.submitReturn.mockResolvedValue({ succeeded: true, submissionReference: "SUB-123" });
    prisma.taxReturn.findUnique.mockResolvedValue(approvedReturn());
    prisma.company.findUniqueOrThrow.mockResolvedValue({ tin: "TIN-1", headOfficeStateCode: "EN" });
    const service = new FilingService(prisma, companies, auditLog, adapters);

    const result = await service.submit("org-1", "company-1", "user-1", "ret-1", "MANUAL");

    expect(result.succeeded).toBe(true);
    expect(prisma.taxReturn.update).toHaveBeenCalledWith({
      where: { id: "ret-1" },
      data: { status: "FILED", submittedAt: expect.any(Date), submissionReference: "SUB-123" },
    });
  });

  test("does not even attempt submission when the adapter's own validation fails", async () => {
    const { prisma, companies, auditLog, adapters, adapter } = makeMocks();
    adapter.validateReturn.mockResolvedValue({ valid: false, errors: ["Missing field X"] });
    prisma.taxReturn.findUnique.mockResolvedValue(approvedReturn());
    prisma.company.findUniqueOrThrow.mockResolvedValue({ tin: "TIN-1", headOfficeStateCode: "EN" });
    const service = new FilingService(prisma, companies, auditLog, adapters);

    const result = await service.submit("org-1", "company-1", "user-1", "ret-1", "MANUAL");

    expect(result.succeeded).toBe(false);
    expect(adapter.submitReturn).not.toHaveBeenCalled();
  });

  test("a successful submission's response reports the honest filing/payment capability, never implying automation that doesn't exist", async () => {
    const { prisma, companies, auditLog, adapters, adapter } = makeMocks();
    adapter.submitReturn.mockResolvedValue({ succeeded: true, submissionReference: "SUB-123" });
    prisma.taxReturn.findUnique.mockResolvedValue(approvedReturn());
    prisma.company.findUniqueOrThrow.mockResolvedValue({ tin: "TIN-1", headOfficeStateCode: "EN" });
    prisma.filingAttempt.create.mockResolvedValue({ id: "attempt-1" });
    const service = new FilingService(prisma, companies, auditLog, adapters);

    const result = await service.submit("org-1", "company-1", "user-1", "ret-1", "MANUAL");

    expect(result.filingCapability).toBe("MANUAL_OFFICIAL_PORTAL");
    expect(result.paymentCapability).toBe("MANUAL_OFFICIAL_PORTAL");
  });
});

describe("FilingService.getAuthorityCapability", () => {
  test("reports the resolved authority's name and capability before any submission is attempted", async () => {
    const { prisma, companies, auditLog, adapters } = makeMocks();
    prisma.company.findUniqueOrThrow.mockResolvedValue({ headOfficeStateCode: "EN" });
    const service = new FilingService(prisma, companies, auditLog, adapters);

    const result = await service.getAuthorityCapability("org-1", "company-1", "VAT");

    expect(result).toEqual({
      authorityName: "Nigeria Revenue Service (NRS)",
      supportsAutomaticSubmission: false,
      filingCapability: "MANUAL_OFFICIAL_PORTAL",
      paymentCapability: "MANUAL_OFFICIAL_PORTAL",
    });
  });

  test("routes PAYE to the head-office-state adapter, same as submit()", async () => {
    const { prisma, companies, auditLog, adapters } = makeMocks();
    prisma.company.findUniqueOrThrow.mockResolvedValue({ headOfficeStateCode: "LA" });
    const service = new FilingService(prisma, companies, auditLog, adapters);

    await service.getAuthorityCapability("org-1", "company-1", "PAYE");

    expect(adapters.get).toHaveBeenCalledWith("LA");
  });
});

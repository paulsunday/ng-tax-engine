import { BadRequestException } from "@nestjs/common";
import { ComplianceCalendarService } from "../../src/api/compliance-calendar/compliance-calendar.service";
import { UnverifiedRuleError, NoApplicableRuleError } from "../../src/types/common";

function makeMocks() {
  const prisma: any = {
    taxReturn: { findUnique: jest.fn() },
    complianceCalendarEntry: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    $transaction: jest.fn(async (arr: any[]) => Promise.all(arr)),
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const auditLog: any = { record: jest.fn() };
  const rules: any = { getEffectiveRule: jest.fn() };
  return { prisma, companies, auditLog, rules };
}

describe("ComplianceCalendarService.createForReturn", () => {
  test("rejects a tax type with no deadline-rule mapping (e.g. WHT, whose governing rule is itself unresolved)", async () => {
    const { prisma, companies, auditLog, rules } = makeMocks();
    prisma.taxReturn.findUnique.mockResolvedValue({ id: "ret-1", companyId: "company-1", taxType: "WHT", periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-06-30"), taxLiabilityNgn: "1000" });
    const service = new ComplianceCalendarService(prisma, companies, auditLog, rules);

    await expect(service.createForReturn("org-1", "company-1", "user-1", "ret-1", 2)).rejects.toThrow(BadRequestException);
  });

  test("computes the VAT statutory deadline as the 21st of the following month and the internal deadline earlier by the configured margin", async () => {
    const { prisma, companies, auditLog, rules } = makeMocks();
    prisma.taxReturn.findUnique.mockResolvedValue({ id: "ret-1", companyId: "company-1", taxType: "VAT", periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-06-30"), taxLiabilityNgn: "107500" });
    rules.getEffectiveRule.mockReturnValue({
      id: "rule-1",
      value: { basis: "fixed_day_of_following_month", dayOfMonth: 21, filing_extension_extends_payment: false },
      sourceDocument: "NTAA",
      sourceReference: "s.22",
      status: "ACTIVE",
    });
    prisma.complianceCalendarEntry.create.mockImplementation(async ({ data }: any) => ({ id: "entry-1", ...data }));

    const service = new ComplianceCalendarService(prisma, companies, auditLog, rules);
    const entry = await service.createForReturn("org-1", "company-1", "user-1", "ret-1", 2);

    expect(entry.statutoryDeadline.toISOString().slice(0, 10)).toBe("2026-07-21");
    expect(entry.internalDeadline!.toISOString().slice(0, 10)).toBe("2026-07-19");
    expect(entry.jurisdiction).toBe("NG-FEDERAL");
    expect(entry.ruleVersionId).toBe("rule-1");
  });

  test("surfaces an unresolved deadline rule as a clear error rather than a stack trace", async () => {
    const { prisma, companies, auditLog, rules } = makeMocks();
    prisma.taxReturn.findUnique.mockResolvedValue({ id: "ret-1", companyId: "company-1", taxType: "VAT", periodStart: new Date("2026-06-01"), periodEnd: new Date("2026-06-30"), taxLiabilityNgn: "1000" });
    rules.getEffectiveRule.mockImplementation(() => {
      throw new UnverifiedRuleError("vat_filing_deadline_rule", "VERIFIED");
    });
    const service = new ComplianceCalendarService(prisma, companies, auditLog, rules);

    await expect(service.createForReturn("org-1", "company-1", "user-1", "ret-1", 2)).rejects.toThrow(BadRequestException);
  });
});

describe("ComplianceCalendarService.listForCompany", () => {
  test("derives daysRemaining at read time rather than storing a value that would go stale", async () => {
    const { prisma, companies, auditLog, rules } = makeMocks();
    const tenDaysFromNow = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    prisma.complianceCalendarEntry.findMany.mockResolvedValue([{ id: "entry-1", statutoryDeadline: tenDaysFromNow }]);
    const service = new ComplianceCalendarService(prisma, companies, auditLog, rules);

    const [entry] = await service.listForCompany("org-1", "company-1");

    expect(entry.daysRemaining).toBeGreaterThanOrEqual(9);
    expect(entry.daysRemaining).toBeLessThanOrEqual(10);
  });
});

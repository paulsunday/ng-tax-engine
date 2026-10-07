import { PrismaRuleRepository } from "../../src/rules/PrismaRuleRepository";
import { UnverifiedRuleError, NoApplicableRuleError } from "../../src/types/common";

function makeVersionRow(overrides: Record<string, any> = {}) {
  return {
    id: "ver-1",
    value: 0.3,
    conditions: null,
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
    status: "ACTIVE",
    sourceReference: "s.56",
    verificationDate: new Date("2026-01-01"),
    verifiedBy: "approver-1",
    ruleVersion: "1.0",
    taxRule: { taxType: "CIT", jurisdiction: "NG_FEDERAL", stateCode: null, ruleKey: "cit_standard_rate", description: "Standard CIT rate" },
    source: { title: "Nigeria Tax Act, 2025", url: "https://example.com/nta2025" },
    ...overrides,
  };
}

describe("PrismaRuleRepository", () => {
  test("refresh() loads ACTIVE rules such that getEffectiveRule resolves them", async () => {
    const prisma: any = { taxRuleVersion: { findMany: jest.fn().mockResolvedValue([makeVersionRow()]) } };
    const repo = new PrismaRuleRepository(prisma);
    await repo.refresh();

    const rule = repo.getEffectiveRule("cit_standard_rate", "CIT", "NG-FEDERAL", "2026-06-30");
    expect(rule.value).toBe(0.3);
    expect(rule.sourceDocument).toBe("Nigeria Tax Act, 2025");
  });

  test("a VERIFIED (not yet ACTIVE) rule throws UnverifiedRuleError, never silently resolves", async () => {
    const prisma: any = { taxRuleVersion: { findMany: jest.fn().mockResolvedValue([makeVersionRow({ status: "VERIFIED" })]) } };
    const repo = new PrismaRuleRepository(prisma);
    await repo.refresh();

    expect(() => repo.getEffectiveRule("cit_standard_rate", "CIT", "NG-FEDERAL", "2026-06-30")).toThrow(UnverifiedRuleError);
  });

  test("a PENDING_APPROVAL rule is not usable even though it passed research/verification", async () => {
    const prisma: any = { taxRuleVersion: { findMany: jest.fn().mockResolvedValue([makeVersionRow({ status: "PENDING_APPROVAL" })]) } };
    const repo = new PrismaRuleRepository(prisma);
    await repo.refresh();

    expect(repo.tryGetEffectiveRule("cit_standard_rate", "CIT", "NG-FEDERAL", "2026-06-30")).toBeNull();
  });

  test("no matching rule throws NoApplicableRuleError rather than returning null from getEffectiveRule", async () => {
    const prisma: any = { taxRuleVersion: { findMany: jest.fn().mockResolvedValue([]) } };
    const repo = new PrismaRuleRepository(prisma);
    await repo.refresh();

    expect(() => repo.getEffectiveRule("cit_standard_rate", "CIT", "NG-FEDERAL", "2026-06-30")).toThrow(NoApplicableRuleError);
  });

  test("a state-specific rule round-trips its jurisdiction string as NG-STATE:<code>", async () => {
    const prisma: any = {
      taxRuleVersion: {
        findMany: jest.fn().mockResolvedValue([
          makeVersionRow({
            taxRule: { taxType: "STATE_LEVY", jurisdiction: "NG_STATE", stateCode: "EN", ruleKey: "enugu_levy", description: "Enugu levy" },
          }),
        ]),
      },
    };
    const repo = new PrismaRuleRepository(prisma);
    await repo.refresh();

    const rule = repo.getEffectiveRule("enugu_levy", "STATE_LEVY", "NG-STATE:EN", "2026-06-30");
    expect(rule.jurisdiction).toBe("NG-STATE:EN");
  });

  test("refresh() replaces the previous snapshot rather than accumulating duplicates across calls", async () => {
    const findMany = jest.fn().mockResolvedValueOnce([makeVersionRow()]).mockResolvedValueOnce([]);
    const prisma: any = { taxRuleVersion: { findMany } };
    const repo = new PrismaRuleRepository(prisma);

    await repo.refresh();
    expect(repo.listAll()).toHaveLength(1);

    await repo.refresh(); // simulates the rule having been retired/superseded since
    expect(repo.listAll()).toHaveLength(0);
  });
});

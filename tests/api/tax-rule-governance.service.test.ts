import { ForbiddenException, BadRequestException } from "@nestjs/common";
import { TaxRuleGovernanceService } from "../../src/api/tax-rule-governance/tax-rule-governance.service";

function activatableVersion(overrides: Record<string, any> = {}) {
  return {
    id: "ver-1",
    taxRuleId: "rule-1",
    status: "VERIFIED",
    sourceId: "src-1",
    sourceReference: "s.1",
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
    calculationMethod: "Multiply base by rate.",
    value: { rate: 0.3 },
    verifiedBy: "user-researcher",
    verificationDate: new Date("2026-01-01"),
    researchNotes: "note",
    supersedesId: null,
    taxRule: { taxType: "CIT", jurisdiction: "NG_FEDERAL" },
    ...overrides,
  };
}

function makeMocks() {
  const prisma: any = {
    taxRuleVersion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    taxRule: { upsert: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    taxRuleSource: { findUnique: jest.fn(), create: jest.fn() },
    taxRuleReview: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    taxRuleApproval: { create: jest.fn(), findMany: jest.fn() },
    taxRuleChangeHistory: { create: jest.fn(), findMany: jest.fn() },
    taxRuleActivationEvent: { create: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
  };
  const ruleRepository: any = { refresh: jest.fn().mockResolvedValue(undefined) };
  const service = new TaxRuleGovernanceService(prisma, ruleRepository);
  return { prisma, ruleRepository, service };
}

describe("TaxRuleGovernanceService — permission gating", () => {
  test.each(["approve", "reject", "requestRevision", "activate", "retire"])("%s rejects a caller who is neither platform admin nor tax-rule approver", async (method) => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValue(activatableVersion({ status: "PENDING_APPROVAL" }));

    const call = (service as any)[method]("user-1", false, false, "ver-1", { reason: "x", notes: "x" });
    await expect(call).rejects.toThrow(ForbiddenException);
  });

  test("a platform admin may approve even without isTaxRuleApprover set", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValue(activatableVersion({ status: "PENDING_APPROVAL" }));
    prisma.taxRuleReview.findFirst.mockResolvedValue({ reviewerId: "someone-else" });
    prisma.taxRuleVersion.update.mockResolvedValue({ id: "ver-1", status: "APPROVED" });

    await expect(service.approve("admin-1", true, false, "ver-1", {})).resolves.toBeDefined();
  });
});

describe("TaxRuleGovernanceService — lifecycle transitions", () => {
  test("research() rejects a rule that is not DRAFT", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValue(activatableVersion({ status: "VERIFIED" }));
    await expect(service.research("u1", "ver-1", { researchNotes: "x" })).rejects.toThrow(BadRequestException);
  });

  test("research() moves DRAFT -> RESEARCHED and records history", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValue(activatableVersion({ status: "DRAFT" }));
    prisma.taxRuleVersion.update.mockResolvedValue({ id: "ver-1", status: "RESEARCHED" });

    await service.research("u1", "ver-1", { researchNotes: "found a source" });

    expect(prisma.taxRuleVersion.update).toHaveBeenCalledWith({ where: { id: "ver-1" }, data: { status: "RESEARCHED", researchNotes: "found a source" } });
    expect(prisma.taxRuleChangeHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "RESEARCHED", newStatus: "RESEARCHED" }) })
    );
  });

  test("verify() rejects a rule with no sourceReference", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValue(activatableVersion({ status: "RESEARCHED", sourceReference: "" }));
    await expect(service.verify("u1", "ver-1", {})).rejects.toThrow(BadRequestException);
  });

  test("submitForApproval() blocks a rule missing calculationMethod (brief: 'calculation method is incomplete')", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValue(activatableVersion({ status: "VERIFIED", calculationMethod: null }));
    await expect(service.submitForApproval("u1", "ver-1")).rejects.toThrow(/calculation method/);
  });

  test("submitForApproval() blocks a rule with an empty value object ('required statutory parameters are missing')", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValue(activatableVersion({ status: "VERIFIED", value: {} }));
    await expect(service.submitForApproval("u1", "ver-1")).rejects.toThrow(/statutory parameters/);
  });

  test("submitForApproval() blocks a rule that was never verified", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValue(activatableVersion({ status: "VERIFIED", verifiedBy: null, verificationDate: null }));
    await expect(service.submitForApproval("u1", "ver-1")).rejects.toThrow(/verification/);
  });

  test("submitForApproval() succeeds for a fully-populated VERIFIED rule and creates a SUBMISSION review", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValue(activatableVersion({ status: "VERIFIED" }));
    prisma.taxRuleVersion.update.mockResolvedValue({ id: "ver-1", status: "PENDING_APPROVAL" });

    await service.submitForApproval("submitter-1", "ver-1");

    expect(prisma.taxRuleReview.create).toHaveBeenCalledWith({ data: { ruleVersionId: "ver-1", reviewerId: "submitter-1", reviewType: "SUBMISSION" } });
  });
});

describe("TaxRuleGovernanceService — approval", () => {
  test("approve() rejects the rule's own submitter approving it (no self-approval)", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValue(activatableVersion({ status: "PENDING_APPROVAL" }));
    prisma.taxRuleReview.findFirst.mockResolvedValue({ reviewerId: "submitter-1" });

    await expect(service.approve("submitter-1", false, true, "ver-1", {})).rejects.toThrow(/own submitter/);
  });

  test("approve() succeeds for a different, authorised approver and records an approval + history entry", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValue(activatableVersion({ status: "PENDING_APPROVAL" }));
    prisma.taxRuleReview.findFirst.mockResolvedValue({ reviewerId: "submitter-1" });
    prisma.taxRuleVersion.update.mockResolvedValue({ id: "ver-1", status: "APPROVED" });

    await service.approve("approver-1", false, true, "ver-1", { reason: "looks right" });

    expect(prisma.taxRuleApproval.create).toHaveBeenCalledWith({ data: { ruleVersionId: "ver-1", approverId: "approver-1", decision: "APPROVED", reason: "looks right" } });
    expect(prisma.taxRuleVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED", approvedBy: "approver-1" }) })
    );
  });

  test("reject() requires PENDING_APPROVAL status and records the reason", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValue(activatableVersion({ status: "PENDING_APPROVAL" }));
    prisma.taxRuleVersion.update.mockResolvedValue({ id: "ver-1", status: "REJECTED" });

    await service.reject("approver-1", false, true, "ver-1", { reason: "source does not support this figure" });

    expect(prisma.taxRuleVersion.update).toHaveBeenCalledWith({ where: { id: "ver-1" }, data: { status: "REJECTED", rejectedReason: "source does not support this figure" } });
  });

  test("requestRevision() sends a PENDING_APPROVAL rule back to RESEARCHED", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValue(activatableVersion({ status: "PENDING_APPROVAL" }));
    prisma.taxRuleVersion.update.mockResolvedValue({ id: "ver-1", status: "RESEARCHED" });

    await service.requestRevision("approver-1", false, true, "ver-1", { notes: "please double-check the effective date" });

    expect(prisma.taxRuleVersion.update).toHaveBeenCalledWith({ where: { id: "ver-1" }, data: { status: "RESEARCHED" } });
  });
});

describe("TaxRuleGovernanceService — activation", () => {
  test("activate() requires APPROVED status", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValue(activatableVersion({ status: "VERIFIED" }));
    await expect(service.activate("approver-1", false, true, "ver-1", {})).rejects.toThrow(BadRequestException);
  });

  test("activate() flips status to ACTIVE, creates an activation event, and refreshes the live rule repository", async () => {
    const { service, prisma, ruleRepository } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValueOnce(activatableVersion({ status: "APPROVED" })).mockResolvedValueOnce(activatableVersion({ status: "ACTIVE" }));
    prisma.taxRuleVersion.findFirst.mockResolvedValue(null); // no previously-active version to supersede
    prisma.taxRuleVersion.update.mockResolvedValue({ id: "ver-1", status: "ACTIVE" });

    await service.activate("approver-1", false, true, "ver-1", { reason: "confirmed" });

    expect(prisma.taxRuleActivationEvent.create).toHaveBeenCalledWith({ data: { ruleVersionId: "ver-1", activatedById: "approver-1", reason: "confirmed" } });
    expect(ruleRepository.refresh).toHaveBeenCalled();
  });

  test("activate() supersedes the previously ACTIVE version of the same rule instead of leaving two ACTIVE rows", async () => {
    const { service, prisma, ruleRepository } = makeMocks();
    const incoming = activatableVersion({ id: "ver-2", status: "APPROVED", effectiveFrom: new Date("2027-01-01") });
    const previouslyActive = activatableVersion({ id: "ver-1", status: "ACTIVE", effectiveTo: null });
    prisma.taxRuleVersion.findUnique.mockResolvedValueOnce(incoming).mockResolvedValueOnce({ ...incoming, status: "ACTIVE" });
    prisma.taxRuleVersion.findFirst.mockResolvedValue(previouslyActive);
    prisma.taxRuleVersion.update.mockResolvedValue({});

    await service.activate("approver-1", false, true, "ver-2", {});

    expect(prisma.taxRuleVersion.update).toHaveBeenCalledWith({
      where: { id: "ver-1" },
      data: expect.objectContaining({ status: "SUPERSEDED" }),
    });
    expect(ruleRepository.refresh).toHaveBeenCalled();
  });

  test("retire() marks a rule RETIRED and refreshes the repository only if it was ACTIVE", async () => {
    const { service, prisma, ruleRepository } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValueOnce(activatableVersion({ status: "ACTIVE" })).mockResolvedValueOnce(activatableVersion({ status: "RETIRED" }));
    prisma.taxRuleVersion.update.mockResolvedValue({});

    await service.retire("admin-1", true, false, "ver-1", { reason: "withdrawn by policy change" });

    expect(ruleRepository.refresh).toHaveBeenCalled();
  });

  test("retire() does not refresh the repository for a non-ACTIVE rule (nothing live changed)", async () => {
    const { service, prisma, ruleRepository } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValueOnce(activatableVersion({ status: "DRAFT" })).mockResolvedValueOnce(activatableVersion({ status: "RETIRED" }));
    prisma.taxRuleVersion.update.mockResolvedValue({});

    await service.retire("admin-1", true, false, "ver-1", { reason: "no longer needed" });

    expect(ruleRepository.refresh).not.toHaveBeenCalled();
  });
});

describe("TaxRuleGovernanceService — create() and supersede()", () => {
  test("create() reuses an existing TaxRuleSource when sourceId is given, and rejects an unknown sourceId", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleSource.findUnique.mockResolvedValue(null);
    await expect(
      service.create("u1", {
        ruleKey: "k",
        taxType: "CIT",
        jurisdiction: "NG_FEDERAL",
        description: "d",
        ruleVersion: "1.0",
        value: 0.3,
        effectiveFrom: "2026-01-01",
        sourceReference: "s.1",
        sourceId: "does-not-exist",
      } as any)
    ).rejects.toThrow(BadRequestException);
  });

  test("create() requires sourceTitle+sourceUrl when no sourceId is given", async () => {
    const { service } = makeMocks();
    await expect(
      service.create("u1", {
        ruleKey: "k",
        taxType: "CIT",
        jurisdiction: "NG_FEDERAL",
        description: "d",
        ruleVersion: "1.0",
        value: 0.3,
        effectiveFrom: "2026-01-01",
        sourceReference: "s.1",
      } as any)
    ).rejects.toThrow(/must cite a source/);
  });

  test("create() for a federal (stateCode-less) rule uses findFirst+create, never a null compound-unique lookup", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleSource.create.mockResolvedValue({ id: "src-1" });
    prisma.taxRule.findFirst.mockResolvedValue(null);
    prisma.taxRule.create.mockResolvedValue({ id: "rule-1" });
    prisma.taxRuleVersion.create.mockResolvedValue({ id: "ver-1" });

    await service.create("u1", {
      ruleKey: "cit_standard_rate",
      taxType: "CIT",
      jurisdiction: "NG_FEDERAL",
      description: "Standard CIT rate",
      ruleVersion: "1.0",
      value: 0.3,
      effectiveFrom: "2026-01-01",
      sourceReference: "s.56",
      sourceTitle: "Nigeria Tax Act, 2025",
      sourceUrl: "https://example.com/nta2025",
    } as any);

    expect(prisma.taxRule.upsert).not.toHaveBeenCalled();
    expect(prisma.taxRule.findFirst).toHaveBeenCalledWith({ where: { ruleKey: "cit_standard_rate", taxType: "CIT", jurisdiction: "NG_FEDERAL", stateCode: null } });
    expect(prisma.taxRule.create).toHaveBeenCalled();
    expect(prisma.taxRuleVersion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ taxRuleId: "rule-1", status: "DRAFT" }) }));
  });

  test("create() for a state-specific rule reuses an existing TaxRule via the compound-unique upsert", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleSource.create.mockResolvedValue({ id: "src-1" });
    prisma.taxRule.upsert.mockResolvedValue({ id: "rule-en-1" });
    prisma.taxRuleVersion.create.mockResolvedValue({ id: "ver-1" });

    await service.create("u1", {
      ruleKey: "enugu_levy",
      taxType: "STATE_LEVY",
      jurisdiction: "NG_STATE",
      stateCode: "EN",
      description: "Enugu state levy",
      ruleVersion: "1.0",
      value: 5000,
      effectiveFrom: "2026-01-01",
      sourceReference: "s.1",
      sourceTitle: "Enugu State Revenue Law",
      sourceUrl: "https://example.com/enugu-law",
    } as any);

    expect(prisma.taxRule.findFirst).not.toHaveBeenCalled();
    expect(prisma.taxRule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ruleKey_taxType_jurisdiction_stateCode: { ruleKey: "enugu_levy", taxType: "STATE_LEVY", jurisdiction: "NG_STATE", stateCode: "EN" } } })
    );
  });

  test("supersede() links the new DRAFT version to the existing one via supersedesId", async () => {
    const { service, prisma } = makeMocks();
    prisma.taxRuleVersion.findUnique.mockResolvedValue(activatableVersion({ id: "ver-1", taxRuleId: "rule-1" }));
    prisma.taxRuleSource.create.mockResolvedValue({ id: "src-new" });
    prisma.taxRuleVersion.create.mockResolvedValue({ id: "ver-2" });

    await service.supersede("u1", "ver-1", {
      ruleVersion: "2.0",
      effectiveFrom: "2027-01-01",
      value: 0.25,
      sourceReference: "s.2",
      sourceTitle: "New Act",
      sourceUrl: "https://example.com/new-act",
    } as any);

    expect(prisma.taxRuleVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ taxRuleId: "rule-1", supersedesId: "ver-1", status: "DRAFT" }) })
    );
  });
});

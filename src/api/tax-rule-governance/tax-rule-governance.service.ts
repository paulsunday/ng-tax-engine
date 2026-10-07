import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RULE_REPOSITORY } from "../tax-rules/tax-rules.constants";
import { RuleRepository } from "../../rules/RuleRepository";
import { CreateRuleDto } from "./dto/create-rule.dto";
import {
  ActivateRuleDto,
  ApproveRuleDto,
  RejectRuleDto,
  RequestRevisionDto,
  ResearchRuleDto,
  RetireRuleDto,
  SupersedeRuleDto,
  VerifyRuleDto,
} from "./dto/rule-action.dto";

interface RefreshableRuleRepository extends RuleRepository {
  refresh(): Promise<void>;
}

/**
 * The only writer of TaxRule/TaxRuleVersion/TaxRuleSource/TaxRuleReview/TaxRuleApproval/
 * TaxRuleChangeHistory/TaxRuleActivationEvent (production-readiness mandate §1). A rule
 * version is never ACTIVE merely because a database field was edited by hand — every
 * transition here is a deliberate, permission-checked, audit-logged method call, and
 * PrismaRuleRepository (the thing the tax engine actually reads from) is refreshed
 * immediately after any mutation that could change what's usable in a live calculation.
 */
@Injectable()
export class TaxRuleGovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(RULE_REPOSITORY) private readonly ruleRepository: RefreshableRuleRepository
  ) {}

  private assertApprover(isPlatformAdmin: boolean, isTaxRuleApprover: boolean): void {
    if (!isPlatformAdmin && !isTaxRuleApprover) {
      throw new ForbiddenException(
        "Only an authorised tax-rule approver may perform this action — see User.isTaxRuleApprover."
      );
    }
  }

  private async recordHistory(params: {
    ruleVersionId: string;
    action: string;
    performedById: string;
    previousStatus?: string | null;
    newStatus?: string | null;
    previousValue?: unknown;
    newValue?: unknown;
    reason?: string;
  }): Promise<void> {
    await this.prisma.taxRuleChangeHistory.create({
      data: {
        ruleVersionId: params.ruleVersionId,
        action: params.action,
        performedById: params.performedById,
        previousStatus: (params.previousStatus as any) ?? null,
        newStatus: (params.newStatus as any) ?? null,
        previousValue: params.previousValue as any,
        newValue: params.newValue as any,
        reason: params.reason,
      },
    });
  }

  async listPending() {
    return this.prisma.taxRuleVersion.findMany({
      where: { status: "PENDING_APPROVAL" },
      include: { taxRule: true, source: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async list(filters: { status?: string; taxType?: string; jurisdiction?: string }) {
    return this.prisma.taxRuleVersion.findMany({
      where: {
        status: filters.status as any,
        taxRule: {
          taxType: filters.taxType as any,
          jurisdiction: filters.jurisdiction as any,
        },
      },
      include: { taxRule: true, source: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async getOne(ruleVersionId: string) {
    const version = await this.prisma.taxRuleVersion.findUnique({
      where: { id: ruleVersionId },
      include: { taxRule: true, source: true, supersedes: true, supersededBy: true },
    });
    if (!version) throw new NotFoundException("Tax rule version not found.");
    return version;
  }

  async getSources(ruleVersionId: string) {
    const version = await this.getOne(ruleVersionId);
    return version.source;
  }

  async getHistory(ruleVersionId: string) {
    await this.getOne(ruleVersionId); // 404 if the version doesn't exist
    const [reviews, approvals, changeHistory, activationEvents] = await Promise.all([
      this.prisma.taxRuleReview.findMany({ where: { ruleVersionId }, include: { reviewer: { select: { id: true, email: true, fullName: true } } } }),
      this.prisma.taxRuleApproval.findMany({ where: { ruleVersionId }, include: { approver: { select: { id: true, email: true, fullName: true } } } }),
      this.prisma.taxRuleChangeHistory.findMany({ where: { ruleVersionId }, include: { performedBy: { select: { id: true, email: true, fullName: true } } } }),
      this.prisma.taxRuleActivationEvent.findMany({ where: { ruleVersionId }, include: { activatedBy: { select: { id: true, email: true, fullName: true } } } }),
    ]);

    const timeline = [
      ...reviews.map((r) => ({ type: "REVIEW" as const, at: r.createdAt, ...r })),
      ...approvals.map((a) => ({ type: "APPROVAL" as const, at: a.createdAt, ...a })),
      ...changeHistory.map((c) => ({ type: "CHANGE" as const, at: c.createdAt, ...c })),
      ...activationEvents.map((e) => ({ type: "ACTIVATION" as const, at: e.activatedAt, ...e })),
    ].sort((a, b) => a.at.getTime() - b.at.getTime());

    return timeline;
  }

  async create(userId: string, dto: CreateRuleDto) {
    const source = await this.resolveSource(dto);
    const taxRule = await this.findOrCreateTaxRule(dto.ruleKey, dto.taxType, dto.jurisdiction, dto.stateCode, dto.description);

    const version = await this.prisma.taxRuleVersion.create({
      data: {
        taxRuleId: taxRule.id,
        ruleVersion: dto.ruleVersion,
        taxYear: dto.taxYear,
        value: dto.value as any,
        rateValue: dto.rateValue,
        thresholds: dto.thresholds as any,
        allowances: dto.allowances as any,
        deductions: dto.deductions as any,
        calculationMethod: dto.calculationMethod,
        conditions: dto.conditions as any,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        status: "DRAFT",
        sourceId: source.id,
        sourceReference: dto.sourceReference,
        researchNotes: dto.researchNotes,
        filingFrequency: dto.filingFrequency,
      },
    });

    await this.recordHistory({ ruleVersionId: version.id, action: "CREATED", performedById: userId, newStatus: "DRAFT" });
    return version;
  }

  /**
   * Prisma's compound-unique `where` helper rejects a literal `null` for a nullable key
   * field outright ("Argument stateCode must not be null") — SQL NULL is never equal to
   * NULL, so "the uniquely identified row" is meaningless when the key itself is null.
   * Federal/non-state rules have stateCode = null, so upsert-by-compound-key only works
   * for state-specific rules; everything else needs a plain findFirst + conditional create.
   */
  private async findOrCreateTaxRule(ruleKey: string, taxType: string, jurisdiction: string, stateCode: string | undefined, description: string) {
    if (stateCode) {
      return this.prisma.taxRule.upsert({
        where: { ruleKey_taxType_jurisdiction_stateCode: { ruleKey, taxType: taxType as any, jurisdiction: jurisdiction as any, stateCode } },
        update: {},
        create: { ruleKey, taxType: taxType as any, jurisdiction: jurisdiction as any, stateCode, description },
      });
    }
    const existing = await this.prisma.taxRule.findFirst({ where: { ruleKey, taxType: taxType as any, jurisdiction: jurisdiction as any, stateCode: null } });
    if (existing) return existing;
    return this.prisma.taxRule.create({ data: { ruleKey, taxType: taxType as any, jurisdiction: jurisdiction as any, description } });
  }

  private async resolveSource(dto: { sourceId?: string; sourceTitle?: string; sourceIssuingAuthority?: string; sourceTier?: number; sourceUrl?: string }) {
    if (dto.sourceId) {
      const existing = await this.prisma.taxRuleSource.findUnique({ where: { id: dto.sourceId } });
      if (!existing) throw new BadRequestException(`sourceId "${dto.sourceId}" does not exist.`);
      return existing;
    }
    if (!dto.sourceTitle || !dto.sourceUrl) {
      throw new BadRequestException("A rule must cite a source: provide sourceId, or sourceTitle + sourceUrl (+ optional sourceIssuingAuthority/sourceTier).");
    }
    return this.prisma.taxRuleSource.create({
      data: {
        title: dto.sourceTitle,
        issuingAuthority: dto.sourceIssuingAuthority ?? "Unspecified — see sourceUrl",
        sourceTier: dto.sourceTier ?? 8,
        url: dto.sourceUrl,
      },
    });
  }

  async research(userId: string, ruleVersionId: string, dto: ResearchRuleDto) {
    const version = await this.getOne(ruleVersionId);
    if (version.status !== "DRAFT") {
      throw new BadRequestException(`Cannot move to RESEARCHED from status "${version.status}" — only DRAFT rules can be researched.`);
    }

    const updated = await this.prisma.taxRuleVersion.update({
      where: { id: ruleVersionId },
      data: { status: "RESEARCHED", researchNotes: dto.researchNotes },
    });

    await this.recordHistory({ ruleVersionId, action: "RESEARCHED", performedById: userId, previousStatus: "DRAFT", newStatus: "RESEARCHED" });
    return updated;
  }

  async verify(userId: string, ruleVersionId: string, dto: VerifyRuleDto) {
    const version = await this.getOne(ruleVersionId);
    if (version.status !== "RESEARCHED") {
      throw new BadRequestException(`Cannot move to VERIFIED from status "${version.status}" — only RESEARCHED rules can be verified.`);
    }
    if (!version.sourceReference) {
      throw new BadRequestException("Cannot verify a rule with no sourceReference (section/paragraph/schedule citation).");
    }

    const updated = await this.prisma.taxRuleVersion.update({
      where: { id: ruleVersionId },
      data: {
        status: "VERIFIED",
        verifiedBy: userId,
        verificationDate: dto.verificationDate ? new Date(dto.verificationDate) : new Date(),
        researchNotes: dto.researchNotes ?? version.researchNotes,
        calculationMethod: dto.calculationMethod ?? version.calculationMethod,
      },
    });

    await this.recordHistory({ ruleVersionId, action: "VERIFIED", performedById: userId, previousStatus: "RESEARCHED", newStatus: "VERIFIED" });
    return updated;
  }

  /**
   * Checks every precondition the mandate explicitly requires before a rule may advance
   * past VERIFIED: source, effective date, jurisdiction, tax type, calculation method, and
   * that a real value/statutory parameter is actually present (not null/empty). Called
   * again, independently, at approve() and activate() — never trust an earlier check alone.
   */
  private assertActivatable(version: {
    sourceId: string | null;
    sourceReference: string | null;
    effectiveFrom: Date | null;
    taxRule: { taxType: string; jurisdiction: string } | null;
    calculationMethod: string | null;
    value: unknown;
    verifiedBy: string | null;
    verificationDate: Date | null;
  }): void {
    const missing: string[] = [];
    if (!version.sourceId) missing.push("source");
    if (!version.effectiveFrom) missing.push("effective date");
    if (!version.taxRule?.jurisdiction) missing.push("jurisdiction");
    if (!version.taxRule?.taxType) missing.push("tax type");
    if (!version.calculationMethod) missing.push("calculation method");
    if (version.value === null || version.value === undefined || (typeof version.value === "object" && Object.keys(version.value as object).length === 0)) {
      missing.push("required statutory parameters (value)");
    }
    if (!version.verifiedBy || !version.verificationDate) missing.push("verification");

    if (missing.length > 0) {
      throw new BadRequestException(`Cannot activate/approve this rule — missing: ${missing.join(", ")}.`);
    }
  }

  async submitForApproval(userId: string, ruleVersionId: string) {
    const version = await this.getOne(ruleVersionId);
    if (version.status !== "VERIFIED") {
      throw new BadRequestException(`Cannot submit for approval from status "${version.status}" — only VERIFIED rules can be submitted.`);
    }
    this.assertActivatable(version);

    const updated = await this.prisma.taxRuleVersion.update({ where: { id: ruleVersionId }, data: { status: "PENDING_APPROVAL" } });
    await this.prisma.taxRuleReview.create({ data: { ruleVersionId, reviewerId: userId, reviewType: "SUBMISSION" } });
    await this.recordHistory({ ruleVersionId, action: "SUBMITTED", performedById: userId, previousStatus: "VERIFIED", newStatus: "PENDING_APPROVAL" });
    return updated;
  }

  async approve(approverId: string, isPlatformAdmin: boolean, isTaxRuleApprover: boolean, ruleVersionId: string, dto: ApproveRuleDto) {
    this.assertApprover(isPlatformAdmin, isTaxRuleApprover);
    const version = await this.getOne(ruleVersionId);
    if (version.status !== "PENDING_APPROVAL") {
      throw new BadRequestException(`Cannot approve from status "${version.status}" — only PENDING_APPROVAL rules can be approved.`);
    }
    this.assertActivatable(version);

    const submission = await this.prisma.taxRuleReview.findFirst({ where: { ruleVersionId, reviewType: "SUBMISSION" }, orderBy: { createdAt: "desc" } });
    if (submission && submission.reviewerId === approverId) {
      throw new ForbiddenException("The rule's own submitter may not approve it — a second, independent authorised reviewer is required.");
    }

    const updated = await this.prisma.taxRuleVersion.update({
      where: { id: ruleVersionId },
      data: { status: "APPROVED", approvedBy: approverId, approvedAt: new Date() },
    });
    await this.prisma.taxRuleApproval.create({ data: { ruleVersionId, approverId, decision: "APPROVED", reason: dto.reason } });
    await this.recordHistory({ ruleVersionId, action: "APPROVED", performedById: approverId, previousStatus: "PENDING_APPROVAL", newStatus: "APPROVED", reason: dto.reason });
    return updated;
  }

  async reject(approverId: string, isPlatformAdmin: boolean, isTaxRuleApprover: boolean, ruleVersionId: string, dto: RejectRuleDto) {
    this.assertApprover(isPlatformAdmin, isTaxRuleApprover);
    const version = await this.getOne(ruleVersionId);
    if (version.status !== "PENDING_APPROVAL") {
      throw new BadRequestException(`Cannot reject from status "${version.status}" — only PENDING_APPROVAL rules can be rejected.`);
    }

    const updated = await this.prisma.taxRuleVersion.update({
      where: { id: ruleVersionId },
      data: { status: "REJECTED", rejectedReason: dto.reason },
    });
    await this.prisma.taxRuleApproval.create({ data: { ruleVersionId, approverId, decision: "REJECTED", reason: dto.reason } });
    await this.recordHistory({ ruleVersionId, action: "REJECTED", performedById: approverId, previousStatus: "PENDING_APPROVAL", newStatus: "REJECTED", reason: dto.reason });
    return updated;
  }

  async requestRevision(reviewerId: string, isPlatformAdmin: boolean, isTaxRuleApprover: boolean, ruleVersionId: string, dto: RequestRevisionDto) {
    this.assertApprover(isPlatformAdmin, isTaxRuleApprover);
    const version = await this.getOne(ruleVersionId);
    if (version.status !== "PENDING_APPROVAL") {
      throw new BadRequestException(`Cannot request revision from status "${version.status}" — only PENDING_APPROVAL rules can be sent back.`);
    }

    const updated = await this.prisma.taxRuleVersion.update({ where: { id: ruleVersionId }, data: { status: "RESEARCHED" } });
    await this.prisma.taxRuleReview.create({ data: { ruleVersionId, reviewerId, reviewType: "REVISION_REQUEST", notes: dto.notes } });
    await this.recordHistory({ ruleVersionId, action: "REVISION_REQUESTED", performedById: reviewerId, previousStatus: "PENDING_APPROVAL", newStatus: "RESEARCHED", reason: dto.notes });
    return updated;
  }

  async activate(approverId: string, isPlatformAdmin: boolean, isTaxRuleApprover: boolean, ruleVersionId: string, dto: ActivateRuleDto) {
    this.assertApprover(isPlatformAdmin, isTaxRuleApprover);
    const version = await this.getOne(ruleVersionId);
    if (version.status !== "APPROVED") {
      throw new BadRequestException(`Cannot activate from status "${version.status}" — only APPROVED rules can be activated.`);
    }
    this.assertActivatable(version);

    const previouslyActive = await this.prisma.taxRuleVersion.findFirst({
      where: { taxRuleId: version.taxRuleId, status: "ACTIVE", id: { not: version.id } },
    });

    await this.prisma.$transaction(async (tx) => {
      if (previouslyActive) {
        const supersedeBoundary = new Date(version.effectiveFrom);
        supersedeBoundary.setDate(supersedeBoundary.getDate() - 1);
        await tx.taxRuleVersion.update({
          where: { id: previouslyActive.id },
          data: { status: "SUPERSEDED", effectiveTo: previouslyActive.effectiveTo ?? supersedeBoundary },
        });
        await tx.taxRuleActivationEvent.updateMany({
          where: { ruleVersionId: previouslyActive.id, deactivatedAt: null },
          data: { deactivatedAt: new Date() },
        });
      }

      await tx.taxRuleVersion.update({
        where: { id: ruleVersionId },
        data: { status: "ACTIVE", supersedesId: version.supersedesId ?? previouslyActive?.id ?? null },
      });
      await tx.taxRuleActivationEvent.create({ data: { ruleVersionId, activatedById: approverId, reason: dto.reason } });
    });

    await this.recordHistory({ ruleVersionId, action: "ACTIVATED", performedById: approverId, previousStatus: "APPROVED", newStatus: "ACTIVE", reason: dto.reason });
    if (previouslyActive) {
      await this.recordHistory({ ruleVersionId: previouslyActive.id, action: "SUPERSEDED", performedById: approverId, previousStatus: "ACTIVE", newStatus: "SUPERSEDED" });
    }

    await this.ruleRepository.refresh();
    return this.getOne(ruleVersionId);
  }

  async retire(userId: string, isPlatformAdmin: boolean, isTaxRuleApprover: boolean, ruleVersionId: string, dto: RetireRuleDto) {
    this.assertApprover(isPlatformAdmin, isTaxRuleApprover);
    const version = await this.getOne(ruleVersionId);
    if (version.status === "SUPERSEDED" || version.status === "RETIRED" || version.status === "REJECTED") {
      throw new BadRequestException(`Cannot retire a rule already in terminal status "${version.status}".`);
    }

    const wasActive = version.status === "ACTIVE";
    await this.prisma.$transaction(async (tx) => {
      await tx.taxRuleVersion.update({
        where: { id: ruleVersionId },
        data: { status: "RETIRED", effectiveTo: wasActive ? (version.effectiveTo ?? new Date()) : version.effectiveTo },
      });
      if (wasActive) {
        await tx.taxRuleActivationEvent.updateMany({ where: { ruleVersionId, deactivatedAt: null }, data: { deactivatedAt: new Date() } });
      }
    });

    await this.recordHistory({ ruleVersionId, action: "RETIRED", performedById: userId, previousStatus: version.status, newStatus: "RETIRED", reason: dto.reason });
    if (wasActive) await this.ruleRepository.refresh();
    return this.getOne(ruleVersionId);
  }

  /** Creates a new DRAFT version linked via supersedesId to an existing (typically ACTIVE) version — see activate() for when the predecessor actually flips to SUPERSEDED. */
  async supersede(userId: string, existingRuleVersionId: string, dto: SupersedeRuleDto) {
    const existing = await this.getOne(existingRuleVersionId);
    const source = await this.resolveSource(dto);

    const newVersion = await this.prisma.taxRuleVersion.create({
      data: {
        taxRuleId: existing.taxRuleId,
        ruleVersion: dto.ruleVersion,
        value: dto.value as any,
        conditions: dto.conditions as any,
        calculationMethod: dto.calculationMethod ?? existing.calculationMethod,
        effectiveFrom: new Date(dto.effectiveFrom),
        status: "DRAFT",
        sourceId: source.id,
        sourceReference: dto.sourceReference,
        researchNotes: dto.researchNotes,
        supersedesId: existing.id,
      },
    });

    await this.recordHistory({
      ruleVersionId: newVersion.id,
      action: "CREATED",
      performedById: userId,
      newStatus: "DRAFT",
      reason: `Proposed replacement for rule version ${existing.id}`,
    });
    return newVersion;
  }
}

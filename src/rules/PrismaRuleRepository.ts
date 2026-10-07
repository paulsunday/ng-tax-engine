import { PrismaClient, Jurisdiction as PrismaJurisdiction } from "@prisma/client";
import { BaseRuleRepository } from "./RuleRepository";
import { RuleRecord, RuleStatus, TaxType } from "../types/common";

function toJurisdictionString(jurisdiction: PrismaJurisdiction, stateCode: string | null): string {
  switch (jurisdiction) {
    case "NG_FEDERAL":
      return "NG-FEDERAL";
    case "NG_LOCAL":
      return "NG-LOCAL";
    case "NG_FEDERAL_AND_STATE":
      return "NG-FEDERAL_AND_STATE";
    case "NG_STATE":
      return stateCode ? `NG-STATE:${stateCode}` : "NG-STATE";
  }
}

/**
 * The real, admin-managed rule source (production-readiness mandate §1-2). Reads
 * TaxRule/TaxRuleVersion/TaxRuleSource — the same tables the tax-rule-governance API
 * (src/api/tax-rule-governance) writes to — so an ACTIVE rule here is one that actually
 * went through DRAFT -> RESEARCHED -> VERIFIED -> PENDING_APPROVAL -> APPROVED -> ACTIVE
 * via that API, never a hand-edited database field.
 *
 * RuleRepository's interface is synchronous (BaseRuleRepository.getEffectiveRule et al. —
 * every tax engine function in src/engine/* calls it inline, mid-calculation, with no
 * `await`). Prisma is inherently async, so this repository loads a full snapshot into
 * memory on construction and serves every read from that snapshot. refresh() re-loads it
 * and MUST be called, awaited, by the governance service after any mutation that changes
 * which version is ACTIVE (activate/supersede/retire) — see TaxRuleGovernanceService. There
 * is deliberately no background polling: an explicit, awaited refresh after a write means
 * there is never a window where a request could observe a stale "no rule approved yet"
 * result after an approval the caller just performed, nor a stale ACTIVE rule after it was
 * just superseded.
 */
export class PrismaRuleRepository extends BaseRuleRepository {
  private rules: RuleRecord[] = [];

  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  async refresh(): Promise<void> {
    const versions = await this.prisma.taxRuleVersion.findMany({
      include: { taxRule: true, source: true },
    });

    this.rules = versions.map((v) => {
      const record: RuleRecord = {
        id: v.id,
        taxType: v.taxRule.taxType as TaxType,
        jurisdiction: toJurisdictionString(v.taxRule.jurisdiction, v.taxRule.stateCode),
        ruleKey: v.taxRule.ruleKey,
        description: v.taxRule.description,
        value: v.value,
        valueType: typeof v.value === "object" && v.value !== null ? "object" : typeof v.value,
        conditions: (v.conditions as Record<string, unknown> | null) ?? undefined,
        effectiveFrom: v.effectiveFrom.toISOString().slice(0, 10),
        effectiveTo: v.effectiveTo ? v.effectiveTo.toISOString().slice(0, 10) : null,
        sourceDocument: v.source.title,
        sourceUrl: v.source.url,
        sourceReference: v.sourceReference,
        ruleVersion: v.ruleVersion,
        status: v.status as RuleStatus,
        verificationDate: v.verificationDate ? v.verificationDate.toISOString().slice(0, 10) : null,
        verifiedBy: v.verifiedBy,
      };
      return record;
    });
  }

  protected allRules(): RuleRecord[] {
    return this.rules;
  }
}

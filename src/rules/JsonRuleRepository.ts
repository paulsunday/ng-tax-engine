import * as fs from "fs";
import * as path from "path";
import { BaseRuleRepository } from "./RuleRepository";
import { RuleRecord, TaxType, RuleStatus } from "../types/common";

interface SeedFileRule {
  id: string;
  tax_type: TaxType;
  jurisdiction: string;
  rule_key: string;
  description: string;
  value: unknown;
  value_type: string;
  conditions?: Record<string, unknown>;
  effective_from: string;
  effective_to: string | null;
  source_document: string | null;
  source_url: string | null;
  source_reference: string | null;
  rule_version: string;
  status: RuleStatus;
  verification_date: string | null;
  verified_by: string | null;
}

interface SeedFile {
  rules: SeedFileRule[];
}

function toRuleRecord(r: SeedFileRule): RuleRecord {
  return {
    id: r.id,
    taxType: r.tax_type,
    jurisdiction: r.jurisdiction,
    ruleKey: r.rule_key,
    description: r.description,
    value: r.value,
    valueType: r.value_type,
    conditions: r.conditions,
    effectiveFrom: r.effective_from,
    effectiveTo: r.effective_to,
    sourceDocument: r.source_document,
    sourceUrl: r.source_url,
    sourceReference: r.source_reference,
    ruleVersion: r.rule_version,
    status: r.status,
    verificationDate: r.verification_date,
    verifiedBy: r.verified_by,
  };
}

/**
 * Loads rules from research/rule_seed_data.json. This is the researched-and-cited
 * rule set produced by the regulatory research pass — see REGULATORY_RESEARCH_REPORT.md.
 * Used for tests and local/offline development. Production deployments should use
 * PrismaRuleRepository against the real, admin-managed rule tables instead.
 */
export class JsonRuleRepository extends BaseRuleRepository {
  private rules: RuleRecord[];

  constructor(filePath: string = path.join(__dirname, "..", "..", "research", "rule_seed_data.json")) {
    super();
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed: SeedFile = JSON.parse(raw);
    this.rules = parsed.rules.map(toRuleRecord);
  }

  protected allRules(): RuleRecord[] {
    return this.rules;
  }

  /**
   * Returns a new repository where DRAFT_VERIFIED rules are promoted to ACTIVE.
   *
   * THIS SIMULATES THE §42 TAX-PROFESSIONAL-APPROVAL STEP AND MUST NEVER BE USED AGAINST
   * REAL TAXPAYER DATA. It exists solely so automated tests and the acceptance demo can
   * exercise the calculation engines end-to-end without a live approval workflow attached.
   * REQUIRES_REVIEW rules are intentionally left untouched — even this demo shortcut
   * refuses to activate a rule whose source was never confirmed.
   */
  withSimulatedDemoApproval(approverLabel = "DEMO HARNESS — NOT a real tax professional approval"): JsonRuleRepository {
    const clone = Object.create(JsonRuleRepository.prototype) as JsonRuleRepository;
    clone.rules = this.rules.map((r) =>
      r.status === "DRAFT_VERIFIED"
        ? { ...r, status: "ACTIVE" as RuleStatus, verifiedBy: `${r.verifiedBy} | promoted by: ${approverLabel}` }
        : r
    );
    return clone;
  }
}

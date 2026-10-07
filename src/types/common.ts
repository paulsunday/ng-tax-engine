/**
 * Shared domain types for the Nigeria tax rules engine.
 * Kept independent of Prisma's generated types so the engine can run against
 * either a real database or the JSON rule-seed fixture used in tests/offline dev.
 */

export type TaxType =
  | "CIT"
  | "DEVELOPMENT_LEVY"
  | "VAT"
  | "WHT"
  | "PAYE"
  | "CAPITAL_ALLOWANCE"
  | "TAX_LOSS"
  | "CAPITAL_GAINS_TAX"
  | "STAMP_DUTY"
  | "STATE_LEVY"
  | "GENERAL";

/**
 * Full rule-governance lifecycle (master-build-prompt production-readiness mandate §1):
 * DRAFT -> RESEARCHED -> VERIFIED -> PENDING_APPROVAL -> APPROVED -> ACTIVE -> SUPERSEDED.
 * RETIRED and REJECTED are terminal off-ramps from anywhere in that chain.
 *   DRAFT             newly authored, no research attached yet
 *   RESEARCHED        a source is attached but the figure itself is unconfirmed/ambiguous
 *                      (was "REQUIRES_REVIEW" — renamed for an explicit 9-state lifecycle)
 *   VERIFIED          source-confirmed against the primary text (was "DRAFT_VERIFIED")
 *   PENDING_APPROVAL  submitted for a qualified tax professional's decision
 *   APPROVED          approved by a qualified tax professional, not yet live
 *   ACTIVE            live — usable for calculations within its effective window
 *   SUPERSEDED        replaced by a newer rule_version; kept for historical reproducibility
 *   RETIRED           administratively withdrawn without ever being wrong per se (was "DEACTIVATED")
 *   REJECTED          reviewed and rejected — never used
 */
export type RuleStatus =
  | "DRAFT"
  | "RESEARCHED"
  | "VERIFIED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "ACTIVE"
  | "SUPERSEDED"
  | "RETIRED"
  | "REJECTED";

/**
 * Statuses that are safe to use in a live calculation.
 * DRAFT_VERIFIED is deliberately excluded: the regulatory brief requires a qualified tax
 * professional's approval before a source-confirmed figure may be relied on in production.
 */
export const USABLE_RULE_STATUSES: ReadonlySet<RuleStatus> = new Set(["APPROVED", "ACTIVE"]);

export type ConfidenceLevel =
  | "VERIFIED_RULE"
  | "VERIFIED_CALCULATION"
  | "REQUIRES_REVIEW"
  | "MISSING_REGULATORY_INFORMATION"
  | "POTENTIAL_REGULATORY_CHANGE"
  | "UNSUPPORTED_SCENARIO";

export interface RuleRecord<TValue = unknown> {
  id: string;
  taxType: TaxType;
  jurisdiction: string; // "NG-FEDERAL" | "NG-STATE" | "NG-STATE:<code>"
  ruleKey: string;
  description: string;
  value: TValue;
  valueType: string;
  conditions?: Record<string, unknown>;
  effectiveFrom: string; // ISO date
  effectiveTo: string | null;
  sourceDocument: string | null;
  sourceUrl: string | null;
  sourceReference: string | null;
  ruleVersion: string;
  status: RuleStatus;
  verificationDate: string | null;
  verifiedBy: string | null;
}

export interface CompanyProfile {
  id: string;
  name: string;
  isResident: boolean;
  isProfessionalServices: boolean;
  turnoverNgn: number;
  fixedAssetsNgn: number;
  vatRegisteredVoluntarily: boolean;
  employeeCount: number;
  sector?: string;
  accountingYearEnd: string; // "MM-DD"
  incorporationDate: string; // ISO date
}

export interface ApplicabilityResult {
  taxType: TaxType;
  applicable: boolean;
  reason: string;
  confidence: ConfidenceLevel;
  ruleIdsUsed: string[];
}

/** Any engine output that cites the rule(s) it relied on, for auditability. */
export interface Explainable {
  explanation: string;
  confidence: ConfidenceLevel;
  ruleIdsUsed: string[];
}

export class UnverifiedRuleError extends Error {
  constructor(ruleKey: string, status: RuleStatus) {
    super(
      `Rule "${ruleKey}" has status "${status}" and cannot be used in a calculation. ` +
        `Only APPROVED or ACTIVE rules may drive a live tax result — see brief §38/§22.`
    );
    this.name = "UnverifiedRuleError";
  }
}

export class NoApplicableRuleError extends Error {
  constructor(ruleKey: string, asOfDate: string) {
    super(`No rule found for "${ruleKey}" effective on ${asOfDate}.`);
    this.name = "NoApplicableRuleError";
  }
}

/**
 * Thrown when a calculation cannot proceed because a required piece of the TAXPAYER's own
 * data is absent — distinct from UnverifiedRuleError/NoApplicableRuleError, which are about
 * the statutory rule, not the taxpayer (production-readiness mandate §2: "calculation
 * unavailable because required taxpayer information is missing" must be its own state).
 */
export class MissingTaxpayerInformationError extends Error {
  constructor(missingField: string) {
    super(`Cannot complete this calculation — required taxpayer information is missing: ${missingField}.`);
    this.name = "MissingTaxpayerInformationError";
  }
}

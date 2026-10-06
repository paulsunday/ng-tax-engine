import { RuleRecord, TaxType, UnverifiedRuleError, NoApplicableRuleError, USABLE_RULE_STATUSES } from "../types/common";

/**
 * Abstraction over "give me the rule that governed this tax on this date."
 * Two implementations exist:
 *   - JsonRuleRepository: reads research/rule_seed_data.json — used in tests and offline/dev.
 *   - PrismaRuleRepository (src/rules/PrismaRuleRepository.ts): reads the real Postgres tables
 *     once a DATABASE_URL is configured. Same interface, so engine code never changes.
 *
 * This is deliberately the single chokepoint through which every statutory figure enters
 * the system — no engine file may contain a literal tax rate, band, or deadline number.
 */
export interface RuleRepository {
  /**
   * Returns the rule version effective on `asOfDate` for the given key.
   * Throws NoApplicableRuleError if nothing matches, or UnverifiedRuleError if the only
   * match is not in an activatable status — callers must not silently fall back to a default.
   */
  getEffectiveRule<TValue = unknown>(
    ruleKey: string,
    taxType: TaxType,
    jurisdiction: string,
    asOfDate: string
  ): RuleRecord<TValue>;

  /** Same as getEffectiveRule but returns null instead of throwing when nothing is found. */
  tryGetEffectiveRule<TValue = unknown>(
    ruleKey: string,
    taxType: TaxType,
    jurisdiction: string,
    asOfDate: string
  ): RuleRecord<TValue> | null;

  listAll(): RuleRecord[];
}

export abstract class BaseRuleRepository implements RuleRepository {
  protected abstract allRules(): RuleRecord[];

  /** Pure date-window lookup, ignoring status/value usability entirely. */
  private findRaw<TValue>(ruleKey: string, taxType: TaxType, jurisdiction: string, asOfDate: string): RuleRecord<TValue> | null {
    const candidates = this.allRules().filter(
      (r) =>
        r.ruleKey === ruleKey &&
        r.taxType === taxType &&
        (r.jurisdiction === jurisdiction || r.jurisdiction === "NG-FEDERAL_AND_STATE")
    );

    const asOf = new Date(asOfDate).getTime();
    const windowMatches = candidates.filter((r) => {
      const from = new Date(r.effectiveFrom).getTime();
      const to = r.effectiveTo ? new Date(r.effectiveTo).getTime() : Infinity;
      return asOf >= from && asOf <= to;
    });

    if (windowMatches.length === 0) return null;

    // Prefer the most specific/newest effectiveFrom if multiple windows somehow overlap.
    windowMatches.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
    return windowMatches[0] as RuleRecord<TValue>;
  }

  /**
   * Never throws. Returns null if no rule matches the date window, OR if the matched
   * rule's status is not usable, OR if its value is null/undefined. Callers that need to
   * distinguish "not found" from "found but unverified" should use getEffectiveRule instead.
   */
  tryGetEffectiveRule<TValue = unknown>(
    ruleKey: string,
    taxType: TaxType,
    jurisdiction: string,
    asOfDate: string
  ): RuleRecord<TValue> | null {
    const match = this.findRaw<TValue>(ruleKey, taxType, jurisdiction, asOfDate);
    if (!match) return null;
    if (!USABLE_RULE_STATUSES.has(match.status)) return null;
    if (match.value === null || match.value === undefined) return null;
    return match;
  }

  /** Throws UnverifiedRuleError or NoApplicableRuleError with a specific reason instead of a generic null. */
  getEffectiveRule<TValue = unknown>(
    ruleKey: string,
    taxType: TaxType,
    jurisdiction: string,
    asOfDate: string
  ): RuleRecord<TValue> {
    const match = this.findRaw<TValue>(ruleKey, taxType, jurisdiction, asOfDate);
    if (!match) throw new NoApplicableRuleError(ruleKey, asOfDate);
    if (!USABLE_RULE_STATUSES.has(match.status)) throw new UnverifiedRuleError(ruleKey, match.status);
    if (match.value === null || match.value === undefined) throw new NoApplicableRuleError(ruleKey, asOfDate);
    return match;
  }

  listAll(): RuleRecord[] {
    return this.allRules();
  }
}

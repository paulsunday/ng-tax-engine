import { JsonRuleRepository } from "../src/rules/JsonRuleRepository";

/**
 * Shared test fixture: the researched rule set with VERIFIED rules promoted to
 * ACTIVE via the explicitly-labelled demo-approval shortcut (see JsonRuleRepository).
 * Never reuse this helper outside of tests.
 */
export function getDemoApprovedRepo(): JsonRuleRepository {
  const base = new JsonRuleRepository();
  return base.withSimulatedDemoApproval();
}

export function getUnapprovedRepo(): JsonRuleRepository {
  return new JsonRuleRepository();
}

/**
 * TEST-ONLY, narrower than withSimulatedDemoApproval: force-activates the single named
 * RESEARCHED rule on top of the normal demo-approved set, so a test can verify that
 * the comparison/arithmetic logic downstream of a rule is correct and ready — independent
 * of whether that specific rule has actually been resolved by a tax professional yet.
 * Must never be used to validate anything other than "the math is right once approved".
 */
export function forceResolveRule(ruleId: string): JsonRuleRepository {
  const base = getDemoApprovedRepo() as any;
  const clone = Object.create(JsonRuleRepository.prototype);
  clone.rules = base.listAll().map((r: any) => (r.id === ruleId ? { ...r, status: "ACTIVE" } : r));
  return clone;
}

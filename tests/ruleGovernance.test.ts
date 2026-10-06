import { JsonRuleRepository } from "../src/rules/JsonRuleRepository";
import { UnverifiedRuleError, NoApplicableRuleError } from "../src/types/common";
import { getUnapprovedRepo, getDemoApprovedRepo } from "./testRepo";

describe("rule governance (brief §22, §38)", () => {
  test("a DRAFT_VERIFIED rule (source-confirmed but not professionally approved) cannot be used in a calculation", () => {
    const repo = getUnapprovedRepo(); // no demo-approval promotion applied
    expect(() => repo.getEffectiveRule("cit_standard_rate", "CIT", "NG-FEDERAL", "2026-06-30")).toThrow(UnverifiedRuleError);
  });

  test("a REQUIRES_REVIEW rule with null value never silently resolves to zero or any default", () => {
    const repo = getDemoApprovedRepo(); // even after demo-approval, REQUIRES_REVIEW rules stay untouched
    // Status is checked before value, so this throws UnverifiedRuleError rather than
    // NoApplicableRuleError — either way, the point is it throws instead of defaulting.
    expect(() => repo.getEffectiveRule("vat_small_business_exemption", "VAT", "NG-FEDERAL", "2026-06-30")).toThrow(
      UnverifiedRuleError
    );
    expect(repo.tryGetEffectiveRule("vat_small_business_exemption", "VAT", "NG-FEDERAL", "2026-06-30")).toBeNull();
  });

  test("querying a date before any rule's effective_from throws rather than returning the nearest rule", () => {
    const repo = getDemoApprovedRepo();
    expect(() => repo.getEffectiveRule("vat_standard_rate", "VAT", "NG-FEDERAL", "2020-01-01")).toThrow(NoApplicableRuleError);
  });

  test("querying the wrong jurisdiction for a state-scoped rule throws rather than matching a federal rule", () => {
    const repo = getDemoApprovedRepo();
    expect(() => repo.getEffectiveRule("rent_relief", "PAYE", "NG-LOCAL", "2026-06-30")).toThrow(NoApplicableRuleError);
  });

  test("listAll() exposes every rule including requires_review ones, for admin review screens", () => {
    const repo = new JsonRuleRepository();
    const all = repo.listAll();
    expect(all.some((r) => r.status === "REQUIRES_REVIEW")).toBe(true);
    expect(all.some((r) => r.status === "DRAFT_VERIFIED")).toBe(true);
  });
});

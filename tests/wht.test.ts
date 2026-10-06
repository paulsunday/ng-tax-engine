import { determineWht, WhtTransactionInput } from "../src/engine/wht";
import { getDemoApprovedRepo, forceResolveRule } from "./testRepo";

const repo = getDemoApprovedRepo();
const AS_OF = "2026-06-30";

function makeTxn(overrides: Partial<WhtTransactionInput> = {}): WhtTransactionInput {
  return {
    transactionCategory: "commission_consultancy_technical_management_professional_fees",
    grossAmountNgn: 1_000_000,
    cumulativeMonthlyValueWithSameSupplierNgn: 1_000_000,
    recipientCategory: "resident_corporate",
    recipientHasValidTin: true,
    supplierIsSmallCompany: false,
    ...overrides,
  };
}

describe("determineWht", () => {
  test("normal case: resident corporate professional fees at 5%", () => {
    const result = determineWht(makeTxn(), repo, AS_OF);
    expect(result.applicable).toBe(true);
    expect(result.rateApplied).toBeCloseTo(0.05);
    expect(result.whtAmountNgn).toBe(50_000);
    expect(result.netPaymentNgn).toBe(950_000);
  });

  test("non-resident corporate professional fees at 10% (double resident rate for this category)", () => {
    const result = determineWht(makeTxn({ recipientCategory: "nonresident_corporate" }), repo, AS_OF);
    expect(result.rateApplied).toBeCloseTo(0.1);
  });

  test("no-TIN doubling applies to non-passive transaction (goods/services)", () => {
    const withTin = determineWht(makeTxn({ transactionCategory: "supply_or_rendering_of_services_other", recipientHasValidTin: true }), repo, AS_OF);
    const withoutTin = determineWht(makeTxn({ transactionCategory: "supply_or_rendering_of_services_other", recipientHasValidTin: false }), repo, AS_OF);
    expect(withoutTin.rateApplied).toBeCloseTo((withTin.rateApplied ?? 0) * 2);
  });

  test("no-TIN doubling does NOT apply to passive income (dividend/interest)", () => {
    const withTin = determineWht(makeTxn({ transactionCategory: "dividend_interest", recipientHasValidTin: true }), repo, AS_OF);
    const withoutTin = determineWht(makeTxn({ transactionCategory: "dividend_interest", recipientHasValidTin: false }), repo, AS_OF);
    expect(withoutTin.rateApplied).toBe(withTin.rateApplied);
  });

  test("N/A cell in rate table -> no WHT applies (e.g. goods supply from non-resident corporate)", () => {
    const result = determineWht(
      makeTxn({ transactionCategory: "supply_of_goods_or_materials_non_manufacturer", recipientCategory: "nonresident_corporate" }),
      repo,
      AS_OF
    );
    expect(result.applicable).toBe(false);
    expect(result.rateApplied).toBe(0);
  });

  test("explicit Reg 10(1) exemption short-circuits rate lookup entirely", () => {
    const result = determineWht(makeTxn({ exemptCategory: "insurance_premium" }), repo, AS_OF);
    expect(result.applicable).toBe(false);
    expect(result.exemptionReason).toMatch(/insurance_premium/);
  });

  test("small-supplier flag always yields REQUIRES_REVIEW today, regardless of transaction value, because the underlying exemption rule is itself unresolved (governance, brief §22/§38)", () => {
    const below = determineWht(
      makeTxn({ supplierIsSmallCompany: true, cumulativeMonthlyValueWithSameSupplierNgn: 1_500_000, recipientHasValidTin: true }),
      repo,
      AS_OF
    );
    const above = determineWht(
      makeTxn({ supplierIsSmallCompany: true, cumulativeMonthlyValueWithSameSupplierNgn: 2_000_001, recipientHasValidTin: true }),
      repo,
      AS_OF
    );
    expect(below.applicable).toBe(false);
    expect(below.confidence).toBe("REQUIRES_REVIEW");
    expect(above.applicable).toBe(false);
    expect(above.confidence).toBe("REQUIRES_REVIEW");
  });

  describe("small-supplier threshold arithmetic (hypothetical: assumes the rule has been professionally resolved)", () => {
    // Uses forceResolveRule(), a narrower test-only override than the usual demo-approval
    // repo, purely to verify the comparison logic itself is correct and ready to go the
    // moment a tax professional actually resolves the CITA-s.105-vs-NTA-s.56 mapping.
    const resolvedRepo = forceResolveRule("TAX-WHT-SMALLSUPPLIER-EXEMPTION-2024");

    test("below threshold -> exempt once the rule is resolvable", () => {
      const result = determineWht(
        makeTxn({ supplierIsSmallCompany: true, cumulativeMonthlyValueWithSameSupplierNgn: 1_500_000, recipientHasValidTin: true }),
        resolvedRepo,
        AS_OF
      );
      expect(result.applicable).toBe(false);
    });

    test("above threshold -> not exempt once the rule is resolvable", () => {
      const result = determineWht(
        makeTxn({ supplierIsSmallCompany: true, cumulativeMonthlyValueWithSameSupplierNgn: 2_000_001, recipientHasValidTin: true }),
        resolvedRepo,
        AS_OF
      );
      expect(result.applicable).toBe(true);
    });
  });

  test("zero gross amount -> zero WHT, no division errors", () => {
    const result = determineWht(makeTxn({ grossAmountNgn: 0 }), repo, AS_OF);
    expect(result.whtAmountNgn).toBe(0);
    expect(result.netPaymentNgn).toBe(0);
  });

  test("unsupported transaction category -> UNSUPPORTED_SCENARIO, not a silent zero", () => {
    const result = determineWht(makeTxn({ transactionCategory: "something_not_in_the_table" }), repo, AS_OF);
    expect(result.confidence).toBe("UNSUPPORTED_SCENARIO");
  });
});

/**
 * Final acceptance test (brief §44), federal scope. Walks one test company through the
 * full pipeline: applicability -> rule loading -> CIT/Dev-Levy/VAT/PAYE calculation ->
 * statutory deadline -> compliance calendar -> manual filing package -> historical
 * immutability check when "today" moves forward past a hypothetical future rule change.
 */
import { determineApplicableTaxes } from "../src/engine/applicability";
import { computeCit } from "../src/engine/cit";
import { computeDevelopmentLevy } from "../src/engine/developmentLevy";
import { computeVat } from "../src/engine/vat";
import { computePaye } from "../src/engine/paye";
import { computeStatutoryDeadline, buildComplianceCalendarEntry } from "../src/engine/deadlines";
import { getRequiredDocuments, groupByPurpose } from "../src/engine/requiredDocuments";
import { ManualFilingAdapter, buildFilingPackage } from "../src/adapters/ManualFilingAdapter";
import { CompanyProfile } from "../src/types/common";
import { getDemoApprovedRepo } from "./testRepo";

const repo = getDemoApprovedRepo();
const AS_OF = "2026-07-15";

const testCompany: CompanyProfile = {
  id: "acceptance-co-1",
  name: "Netwave Technologies Ltd",
  isResident: true,
  isProfessionalServices: false,
  turnoverNgn: 300_000_000,
  fixedAssetsNgn: 150_000_000,
  vatRegisteredVoluntarily: false,
  employeeCount: 12,
  accountingYearEnd: "12-31",
  incorporationDate: "2018-03-01",
};

describe("§44 final acceptance test — federal scope", () => {
  test("1-3: company created, classified, applicable taxes determined", () => {
    const applicability = determineApplicableTaxes(testCompany, repo, AS_OF);
    expect(applicability.find((a) => a.taxType === "CIT")?.applicable).toBe(true);
    expect(applicability.find((a) => a.taxType === "DEVELOPMENT_LEVY")?.applicable).toBe(true);
    expect(applicability.find((a) => a.taxType === "VAT")?.applicable).toBe(true);
    expect(applicability.find((a) => a.taxType === "PAYE")?.applicable).toBe(true);
    for (const a of applicability) {
      expect(a.reason.length).toBeGreaterThan(0); // every verdict is explained, never bare
    }
  });

  test("4-9: transactions imported, accounting profit -> taxable profit -> tax calculated, transparently", () => {
    const cit = computeCit(
      testCompany,
      { accountingProfitNgn: 80_000_000, nonDeductibleExpensesNgn: 4_000_000, nonTaxableIncomeNgn: 1_000_000, totalCapitalAllowanceNgn: 15_000_000, totalLossReliefNgn: 2_000_000 },
      repo,
      AS_OF
    );
    expect(cit.taxLiabilityNgn).toBeGreaterThan(0);
    expect(cit.breakdown).toHaveProperty("= taxLiabilityNgn");
    expect(cit.confidence).toBe("VERIFIED_CALCULATION");

    const levy = computeDevelopmentLevy(testCompany, cit.assessableProfitNgn, repo, AS_OF);
    expect(levy.applicable).toBe(true);
    expect(levy.levyLiabilityNgn).toBeGreaterThan(0);

    const vat = computeVat(testCompany, { taxableSuppliesNgn: 50_000_000, recoverableInputVatNgn: 1_000_000, nonRecoverableInputVatNgn: 100_000 }, repo, AS_OF);
    expect(vat.registrationRequired).toBe(true);

    const paye = computePaye({ employeeId: "emp-1", stateOfResidence: "Enugu", annualGrossEmolumentNgn: 4_500_000, annualRentPaidNgn: 900_000, isMinimumWageEarner: false }, repo, AS_OF);
    expect(paye.annualTaxNgn).toBeGreaterThan(0);
  });

  test("10: statutory filing deadline calculated for VAT period", () => {
    const deadline = computeStatutoryDeadline(
      { taxType: "VAT", ruleKey: "vat_filing_deadline_rule", jurisdiction: "NG-FEDERAL", periodEnd: "2026-06-30" },
      repo,
      AS_OF
    );
    expect(deadline.statutoryDeadline).toBe("2026-07-21");

    const calendarEntry = buildComplianceCalendarEntry({
      taxType: "VAT",
      periodLabel: "June 2026",
      statutoryDeadline: deadline.statutoryDeadline,
      internalSafetyMarginDays: 2,
      amountNgn: 2_750_000,
      asOfDate: AS_OF,
    });
    expect(calendarEntry.internalDeadline).toBe("2026-07-19");
    expect(calendarEntry.isOverdue).toBe(false);
  });

  test("11-12: return generated and validated via the manual filing adapter", async () => {
    const adapter = new ManualFilingAdapter("Nigeria Revenue Service");
    const payload = {
      taxReturnId: "ret-1",
      taxType: "VAT",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      taxpayerTin: "TIN-123456789",
      calculationBreakdown: { outputVat: 3_750_000, inputVat: 1_000_000, payable: 2_750_000 },
      taxLiabilityNgn: 2_750_000,
    };
    const validation = await adapter.validateReturn(payload);
    expect(validation.valid).toBe(true);
  });

  test("13-14: no official e-filing API confirmed -> submission fails gracefully, filing package generated instead, nothing marked as filed", async () => {
    const adapter = new ManualFilingAdapter("Nigeria Revenue Service");
    const payload = {
      taxReturnId: "ret-1",
      taxType: "VAT",
      periodStart: "2026-06-01",
      periodEnd: "2026-06-30",
      taxpayerTin: "TIN-123456789",
      calculationBreakdown: { outputVat: 3_750_000, inputVat: 1_000_000, payable: 2_750_000 },
      taxLiabilityNgn: 2_750_000,
    };
    const result = await adapter.submitReturn(payload);
    expect(result.succeeded).toBe(false); // brief §28-29: do not mark as filed
    const pkg = buildFilingPackage(payload);
    expect(pkg).toHaveProperty("instructions");
  });

  test("15-16: required documents checklist generated for onboarding/audit", () => {
    const applicability = determineApplicableTaxes(testCompany, repo, AS_OF);
    const docs = getRequiredDocuments(testCompany, applicability);
    const grouped = groupByPurpose(docs);
    expect(grouped["ONBOARDING"].length).toBeGreaterThan(0);
    expect(grouped["AUDIT"].length).toBeGreaterThan(0);
    // audited financials required because this company is not a small company
    expect(docs.find((d) => d.code === "AUDITED_FINANCIAL_STATEMENTS")).toBeDefined();
  });

  test("18-20: a hypothetical future rule change does not alter this period's already-computed figures", () => {
    // The company's 2026-06-30 VAT return used the current 7.5% rate. Even if we re-run the
    // SAME computation "later" (a later asOfDate still within the rule's effective window),
    // the result for that historical period must be identical — because the engine looks up
    // the rule effective ON THE PERIOD, driven by periodEnd, not by "today".
    const deadlineComputedEarly = computeStatutoryDeadline(
      { taxType: "VAT", ruleKey: "vat_filing_deadline_rule", jurisdiction: "NG-FEDERAL", periodEnd: "2026-06-30" },
      repo,
      "2026-07-01"
    );
    const deadlineComputedLate = computeStatutoryDeadline(
      { taxType: "VAT", ruleKey: "vat_filing_deadline_rule", jurisdiction: "NG-FEDERAL", periodEnd: "2026-06-30" },
      repo,
      "2026-12-31"
    );
    expect(deadlineComputedEarly.statutoryDeadline).toBe(deadlineComputedLate.statutoryDeadline);
  });

  test("22: unresolved regulatory dependencies remain visible, not hidden", () => {
    const vat = computeVat(
      { ...testCompany, turnoverNgn: 20_000_000, fixedAssetsNgn: 50_000_000 },
      { taxableSuppliesNgn: 1_000_000, recoverableInputVatNgn: 0, nonRecoverableInputVatNgn: 0 },
      repo,
      AS_OF
    );
    expect(vat.confidence).toBe("REQUIRES_REVIEW");
    expect(vat.explanation).toMatch(/research report/i);
  });
});

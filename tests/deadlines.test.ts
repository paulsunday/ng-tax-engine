import { computeStatutoryDeadline, buildComplianceCalendarEntry } from "../src/engine/deadlines";
import { getDemoApprovedRepo } from "./testRepo";

const repo = getDemoApprovedRepo();
const AS_OF = "2026-06-30";

describe("computeStatutoryDeadline", () => {
  test("VAT: 21st of the month following period end", () => {
    const result = computeStatutoryDeadline(
      { taxType: "VAT", ruleKey: "vat_filing_deadline_rule", jurisdiction: "NG-FEDERAL", periodEnd: "2026-09-30" },
      repo,
      AS_OF
    );
    expect(result.statutoryDeadline).toBe("2026-10-21");
    expect(result.filingExtensionExtendsPayment).toBe(false);
  });

  test("VAT deadline rolls into the next year correctly across a December period", () => {
    const result = computeStatutoryDeadline(
      { taxType: "VAT", ruleKey: "vat_filing_deadline_rule", jurisdiction: "NG-FEDERAL", periodEnd: "2026-12-31" },
      repo,
      AS_OF
    );
    expect(result.statutoryDeadline).toBe("2027-01-21");
  });

  test("CIT established company: 6 months after accounting year end", () => {
    const result = computeStatutoryDeadline(
      {
        taxType: "CIT",
        ruleKey: "cit_filing_deadline_rule",
        jurisdiction: "NG-FEDERAL",
        periodEnd: "2026-12-31",
        pathSelector: "established_company",
      },
      repo,
      AS_OF
    );
    expect(result.statutoryDeadline).toBe("2027-06-30");
  });

  test("CIT newly incorporated: earlier-of logic picks the sooner of the two options", () => {
    const result = computeStatutoryDeadline(
      {
        taxType: "CIT",
        ruleKey: "cit_filing_deadline_rule",
        jurisdiction: "NG-FEDERAL",
        periodEnd: "2026-12-31",
        incorporationDate: "2026-01-15",
        pathSelector: "newly_incorporated",
      },
      repo,
      AS_OF
    );
    // 18 months after incorporation = 2027-07-15; 6 months after period end = 2027-06-30 -> earlier one wins
    expect(result.statutoryDeadline).toBe("2027-06-30");
  });

  test("PAYE annual employer return: fixed 31 Jan of the year AFTER the period", () => {
    const result = computeStatutoryDeadline(
      { taxType: "PAYE", ruleKey: "paye_annual_employer_return_deadline", jurisdiction: "NG-STATE", periodEnd: "2026-12-31" },
      repo,
      AS_OF
    );
    expect(result.statutoryDeadline).toBe("2027-01-31");
  });
});

describe("buildComplianceCalendarEntry", () => {
  test("internal deadline is always before or equal to the statutory deadline (never later)", () => {
    const entry = buildComplianceCalendarEntry({
      taxType: "VAT",
      periodLabel: "September 2026",
      statutoryDeadline: "2026-10-21",
      internalSafetyMarginDays: 2,
      amountNgn: 1_000_000,
      asOfDate: "2026-10-01",
    });
    expect(entry.internalDeadline).toBe("2026-10-19");
    expect(new Date(entry.internalDeadline).getTime()).toBeLessThanOrEqual(new Date(entry.statutoryDeadline).getTime());
    expect(entry.recommendedFilingDate).toBe("2026-10-18");
  });

  test("overdue detection: past statutory deadline flags isOverdue", () => {
    const entry = buildComplianceCalendarEntry({
      taxType: "VAT",
      periodLabel: "August 2026",
      statutoryDeadline: "2026-09-21",
      internalSafetyMarginDays: 2,
      asOfDate: "2026-10-01",
    });
    expect(entry.isOverdue).toBe(true);
    expect(entry.daysRemaining).toBeLessThan(0);
  });

  test("not yet due: future statutory deadline is not overdue and daysRemaining is positive", () => {
    const entry = buildComplianceCalendarEntry({
      taxType: "VAT",
      periodLabel: "October 2026",
      statutoryDeadline: "2026-11-21",
      internalSafetyMarginDays: 2,
      asOfDate: "2026-10-01",
    });
    expect(entry.isOverdue).toBe(false);
    expect(entry.daysRemaining).toBeGreaterThan(0);
  });

  test("statutory deadline earlier than the 21st is honoured as-is, never pushed later", () => {
    const entry = buildComplianceCalendarEntry({
      taxType: "PAYE",
      periodLabel: "Annual 2026",
      statutoryDeadline: "2027-01-31",
      internalSafetyMarginDays: 2,
      asOfDate: "2026-10-01",
    });
    expect(entry.statutoryDeadline).toBe("2027-01-31");
  });
});

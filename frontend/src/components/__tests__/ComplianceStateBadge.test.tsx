import { render, screen } from "@testing-library/react";
import { ComplianceStateBadge } from "../../app/companies/[companyId]/page";

describe("ComplianceStateBadge", () => {
  test("renders CALCULATED in green — the only state implying a real, usable liability figure", () => {
    render(<ComplianceStateBadge state="CALCULATED" />);
    const badge = screen.getByText("CALCULATED");
    expect(badge.className).toMatch(/green/);
  });

  test("renders PENDING_RULE_APPROVAL in yellow, with underscores replaced by spaces", () => {
    render(<ComplianceStateBadge state="PENDING_RULE_APPROVAL" />);
    const badge = screen.getByText("PENDING RULE APPROVAL");
    expect(badge.className).toMatch(/yellow/);
  });

  test("renders CALCULATION_ERROR in red — never the same color as a genuine result", () => {
    render(<ComplianceStateBadge state="CALCULATION_ERROR" />);
    const badge = screen.getByText("CALCULATION ERROR");
    expect(badge.className).toMatch(/red/);
  });

  test("falls back to a neutral color for any other state, rather than defaulting to green/success", () => {
    render(<ComplianceStateBadge state="MISSING_TAXPAYER_INFORMATION" />);
    const badge = screen.getByText("MISSING TAXPAYER INFORMATION");
    expect(badge.className).not.toMatch(/green/);
    expect(badge.className).toMatch(/gray/);
  });
});

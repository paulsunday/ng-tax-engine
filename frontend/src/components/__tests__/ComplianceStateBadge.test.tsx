import { render, screen } from "@testing-library/react";
import { ComplianceStateBadge } from "../../app/companies/[companyId]/page";

describe("ComplianceStateBadge", () => {
  test("renders CALCULATED with tone=success — the only state implying a real, usable liability figure", () => {
    render(<ComplianceStateBadge state="CALCULATED" />);
    const badge = screen.getByText("CALCULATED");
    expect(badge.dataset.tone).toBe("success");
  });

  test("renders PENDING_RULE_APPROVAL with tone=warning, with underscores replaced by spaces", () => {
    render(<ComplianceStateBadge state="PENDING_RULE_APPROVAL" />);
    const badge = screen.getByText("PENDING RULE APPROVAL");
    expect(badge.dataset.tone).toBe("warning");
  });

  test("renders CALCULATION_ERROR with tone=danger — never the same tone as a genuine result", () => {
    render(<ComplianceStateBadge state="CALCULATION_ERROR" />);
    const badge = screen.getByText("CALCULATION ERROR");
    expect(badge.dataset.tone).toBe("danger");
  });

  test("falls back to tone=neutral for any other state, rather than defaulting to success", () => {
    render(<ComplianceStateBadge state="MISSING_TAXPAYER_INFORMATION" />);
    const badge = screen.getByText("MISSING TAXPAYER INFORMATION");
    expect(badge.dataset.tone).not.toBe("success");
    expect(badge.dataset.tone).toBe("neutral");
  });
});

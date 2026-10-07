import { ManualFilingAdapter } from "../../src/adapters/ManualFilingAdapter";
import { EnuguTaxAuthorityAdapter } from "../../src/adapters/EnuguTaxAuthorityAdapter";

describe("Filing/payment capability classification (production-readiness mandate §21)", () => {
  test("ManualFilingAdapter honestly reports MANUAL_OFFICIAL_PORTAL for both filing and payment — never implies automation that doesn't exist", () => {
    const adapter = new ManualFilingAdapter("Some State IRS");
    expect(adapter.supportsAutomaticSubmission).toBe(false);
    expect(adapter.filingCapability).toBe("MANUAL_OFFICIAL_PORTAL");
    expect(adapter.paymentCapability).toBe("MANUAL_OFFICIAL_PORTAL");
  });

  test("EnuguTaxAuthorityAdapter inherits the same honest classification — no official API was found during research, so it must not claim a higher capability", () => {
    const adapter = new EnuguTaxAuthorityAdapter();
    expect(adapter.filingCapability).toBe("MANUAL_OFFICIAL_PORTAL");
    expect(adapter.paymentCapability).toBe("MANUAL_OFFICIAL_PORTAL");
  });
});

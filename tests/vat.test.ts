import { computeVat } from "../src/engine/vat";
import { CompanyProfile } from "../src/types/common";
import { getDemoApprovedRepo } from "./testRepo";

const repo = getDemoApprovedRepo();
const AS_OF = "2026-06-30";

function makeCompany(overrides: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    id: "c1",
    name: "Gamma Traders Ltd",
    isResident: true,
    isProfessionalServices: false,
    turnoverNgn: 200_000_000,
    fixedAssetsNgn: 300_000_000,
    vatRegisteredVoluntarily: false,
    employeeCount: 20,
    accountingYearEnd: "12-31",
    incorporationDate: "2015-01-01",
    ...overrides,
  };
}

describe("computeVat", () => {
  test("normal case: output VAT minus recoverable input VAT = payable", () => {
    const result = computeVat(
      makeCompany(),
      { taxableSuppliesNgn: 10_000_000, recoverableInputVatNgn: 300_000, nonRecoverableInputVatNgn: 50_000 },
      repo,
      AS_OF
    );
    expect(result.outputVatNgn).toBe(750_000); // 10m * 7.5%
    expect(result.vatPayableOrCreditNgn).toBe(450_000);
  });

  test("input VAT exceeds output VAT -> credit (negative payable)", () => {
    const result = computeVat(
      makeCompany(),
      { taxableSuppliesNgn: 1_000_000, recoverableInputVatNgn: 200_000, nonRecoverableInputVatNgn: 0 },
      repo,
      AS_OF
    );
    expect(result.vatPayableOrCreditNgn).toBeLessThan(0);
  });

  test("zero taxable supplies -> zero output VAT", () => {
    const result = computeVat(
      makeCompany(),
      { taxableSuppliesNgn: 0, recoverableInputVatNgn: 0, nonRecoverableInputVatNgn: 0 },
      repo,
      AS_OF
    );
    expect(result.outputVatNgn).toBe(0);
  });

  test("small business exemption: no voluntary registration -> VAT not computed", () => {
    const result = computeVat(
      makeCompany({ turnoverNgn: 20_000_000, fixedAssetsNgn: 50_000_000 }),
      { taxableSuppliesNgn: 5_000_000, recoverableInputVatNgn: 0, nonRecoverableInputVatNgn: 0 },
      repo,
      AS_OF
    );
    expect(result.registrationRequired).toBe(false);
    expect(result.outputVatNgn).toBe(0);
    expect(result.confidence).toBe("REQUIRES_REVIEW"); // numeric threshold linkage unconfirmed, per research report
  });

  test("small business that opts in voluntarily -> VAT is computed", () => {
    const result = computeVat(
      makeCompany({ turnoverNgn: 20_000_000, fixedAssetsNgn: 50_000_000, vatRegisteredVoluntarily: true }),
      { taxableSuppliesNgn: 5_000_000, recoverableInputVatNgn: 0, nonRecoverableInputVatNgn: 0 },
      repo,
      AS_OF
    );
    expect(result.registrationRequired).toBe(true);
    expect(result.outputVatNgn).toBe(375_000);
  });

  test("non-resident self-withheld VAT is added to payable, not netted against input VAT", () => {
    const result = computeVat(
      makeCompany(),
      { taxableSuppliesNgn: 1_000_000, recoverableInputVatNgn: 0, nonRecoverableInputVatNgn: 0, nonResidentSelfWithheldVatNgn: 100_000 },
      repo,
      AS_OF
    );
    expect(result.vatPayableOrCreditNgn).toBe(75_000 + 100_000);
  });
});

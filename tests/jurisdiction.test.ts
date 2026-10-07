/**
 * Multi-state acceptance test (brief §35) using the exact worked example from the brief:
 *   Netwave Technologies Ltd — head office Enugu, branches in Lagos and Anambra/Abuja,
 *   employees across all touched states. Verifies the system does NOT collapse this to
 *   "registered in Enugu, therefore only Enugu applies" (brief §2's explicit prohibition).
 */
import { buildJurisdictionMatrix, groupMatrixForDashboard } from "../src/engine/jurisdiction";
import { determineApplicableTaxes } from "../src/engine/applicability";
import { StateAuthorityRepository } from "../src/rules/StateAuthorityRepository";
import { AdapterRegistry } from "../src/adapters/AdapterRegistry";
import { MultiStateCompanyInput } from "../src/types/jurisdiction";
import { CompanyProfile } from "../src/types/common";
import { getDemoApprovedRepo } from "./testRepo";

const rules = getDemoApprovedRepo();
const stateAuthorities = new StateAuthorityRepository();
const AS_OF = "2026-07-15";

const companyProfile: CompanyProfile = {
  id: "netwave-1",
  name: "Netwave Technologies Ltd",
  isResident: true,
  isProfessionalServices: false,
  turnoverNgn: 400_000_000,
  fixedAssetsNgn: 200_000_000,
  vatRegisteredVoluntarily: false,
  employeeCount: 6,
  accountingYearEnd: "12-31",
  incorporationDate: "2017-05-01",
};

const multiState: MultiStateCompanyInput = {
  id: "netwave-1",
  name: "Netwave Technologies Ltd",
  headOfficeStateCode: "EN",
  branches: [
    { id: "br-lagos", label: "Lagos Branch", stateCode: "LA", hasBusinessPremises: true },
    { id: "br-fct", label: "Abuja Branch", stateCode: "FC", hasBusinessPremises: true },
  ],
  employees: [
    { id: "e1", fullName: "Chidi Okafor", stateOfResidenceCode: "EN", stateOfWorkCode: "EN" },
    { id: "e2", fullName: "Tunde Bakare", stateOfResidenceCode: "LA", stateOfWorkCode: "LA" },
    { id: "e3", fullName: "Amina Bello", stateOfResidenceCode: "FC", stateOfWorkCode: "FC" },
    { id: "e4", fullName: "Ngozi Eze", stateOfResidenceCode: "AN", stateOfWorkCode: "LA" }, // lives Anambra, works Lagos branch
  ],
};

describe("multi-state jurisdiction matrix (brief §35-36)", () => {
  const federalApplicability = determineApplicableTaxes(companyProfile, rules, AS_OF);
  const matrix = buildJurisdictionMatrix(multiState, federalApplicability, stateAuthorities);

  test("federal obligations appear exactly once, independent of how many states are touched", () => {
    const federalRows = matrix.filter((m) => m.jurisdictionLevel === "FEDERAL");
    const citRows = federalRows.filter((m) => m.obligationLabel === "CIT");
    expect(citRows.length).toBe(1);
  });

  test("does NOT collapse to head-office-state-only: Lagos, FCT, Anambra all appear", () => {
    const stateCodesPresent = new Set(matrix.filter((m) => m.jurisdictionLevel === "STATE").map((m) => m.stateCode));
    expect(stateCodesPresent.has("EN")).toBe(true);
    expect(stateCodesPresent.has("LA")).toBe(true);
    expect(stateCodesPresent.has("FC")).toBe(true);
    expect(stateCodesPresent.has("AN")).toBe(true); // employee residence, even with no branch there
  });

  test("Enugu obligation uses the fully-researched authority and gets VERIFIED_RULE confidence for PAYE", () => {
    const enuguPaye = matrix.find((m) => m.stateCode === "EN" && m.obligationLabel === "PAYE");
    expect(enuguPaye).toBeDefined();
    expect(enuguPaye!.authorityVerificationStatus).toBe("FULLY_RESEARCHED");
    expect(enuguPaye!.confidence).toBe("VERIFIED_RULE");
  });

  test("Lagos is now FULLY_RESEARCHED (real browser research, 2026-10-07) — reports its own real levies, never Enugu's", () => {
    const lagosBusiness = matrix.find((m) => m.stateCode === "LA" && m.obligationLabel.includes("Business-related"));
    expect(lagosBusiness).toBeDefined();
    // Even with a FULLY_RESEARCHED directory entry, exact per-levy amounts still require
    // separate verification before a figure could drive a calculation — REQUIRES_REVIEW is
    // correct here, not VERIFIED_RULE (see src/engine/jurisdiction.ts).
    expect(lagosBusiness!.confidence).toBe("REQUIRES_REVIEW");
    expect(lagosBusiness!.reason).toMatch(/Hotel Occupancy and Restaurant Consumption Tax|Business Premises Levy/);
    // Enugu's specific levy names must never leak into Lagos's own reason string.
    expect(lagosBusiness!.reason).not.toMatch(/Mortuary Levy|Mining Truck Tax|Purchase Tax on Hotels/);
  });

  test("employee working in a different state than they reside in is flagged for review, not silently resolved either way", () => {
    const anambraRow = matrix.find((m) => m.stateCode === "AN");
    expect(anambraRow).toBeDefined();
    const lagosRow = matrix.filter((m) => m.stateCode === "LA");
    const flaggedSomewhere = [anambraRow, ...lagosRow].some((r) => r?.reason.match(/WORKS here but resides in a different state/));
    expect(flaggedSomewhere).toBe(true);
  });

  test("dashboard grouping (brief §18) separates FEDERAL / each state into its own bucket", () => {
    const grouped = groupMatrixForDashboard(matrix);
    expect(Object.keys(grouped)).toContain("FEDERAL");
    expect(Object.keys(grouped)).toContain("Enugu");
    expect(Object.keys(grouped)).toContain("Lagos");
    expect(Object.keys(grouped)).toContain("Federal Capital Territory");
  });

  test("Kano/Rivers/Ogun (FULLY_RESEARCHED 2026-10-07, second pass) resolve without crashing and report their own authority names", () => {
    const multiState2: MultiStateCompanyInput = {
      id: "netwave-2",
      name: "Second Pass Co",
      headOfficeStateCode: "RI",
      branches: [
        { id: "br-kano", label: "Kano Branch", stateCode: "KN", hasBusinessPremises: true },
        { id: "br-ogun", label: "Ogun Branch", stateCode: "OG", hasBusinessPremises: true },
      ],
      employees: [],
    };
    // Regression test: other_levies_observed must be an array (jurisdiction.ts calls
    // .join(", ") on it) — an earlier pass briefly recorded it as a plain string for these
    // three states, which would throw a TypeError the instant any of them was touched.
    // This test exercises exactly that code path for real, not just via JSON validation.
    const matrix2 = buildJurisdictionMatrix(multiState2, federalApplicability, stateAuthorities);
    const stateRows = matrix2.filter((m) => m.jurisdictionLevel === "STATE");
    expect(stateRows.length).toBeGreaterThan(0);

    const rivers = stateRows.find((m) => m.stateCode === "RI");
    expect(rivers!.reason).toMatch(/Rivers State Internal Revenue Service \(RSIRS\)/);
    const kano = stateRows.find((m) => m.stateCode === "KN");
    expect(kano!.reason).toMatch(/Kano State Internal Revenue Service \(KIRS\)/);
    const ogun = stateRows.find((m) => m.stateCode === "OG");
    expect(ogun!.reason).toMatch(/Ogun State Internal Revenue Service \(OGIRS\)/);
  });

  test("a state with no directory entry at all produces a MISSING_REGULATORY_INFORMATION row, never a crash or silent skip", () => {
    const companyInGhostState: MultiStateCompanyInput = {
      ...multiState,
      headOfficeStateCode: "ZZ", // deliberately not in the directory
      branches: [],
      employees: [],
    };
    const ghostMatrix = buildJurisdictionMatrix(companyInGhostState, federalApplicability, stateAuthorities);
    const ghostRow = ghostMatrix.find((m) => m.stateCode === "ZZ");
    expect(ghostRow).toBeDefined();
    expect(ghostRow!.confidence).toBe("MISSING_REGULATORY_INFORMATION");
  });
});

describe("AdapterRegistry (brief §21)", () => {
  const registry = new AdapterRegistry(stateAuthorities);

  test("every one of the 36 states + FCT + FEDERAL has a registered adapter", () => {
    const jurisdictions = registry.listJurisdictions();
    expect(jurisdictions.length).toBe(38); // 36 states + FCT + FEDERAL
  });

  test("Enugu resolves to the dedicated, research-backed adapter", () => {
    const adapter = registry.get("EN");
    expect(adapter.authorityName).toMatch(/Enugu/i);
  });

  test("an unresearched state still resolves to a safe generic adapter that refuses automatic submission", () => {
    const adapter = registry.get("ZA"); // Zamfara — LOCATED_SECONDARY_SOURCE_UNVERIFIED
    expect(adapter.supportsAutomaticSubmission).toBe(false);
  });
});

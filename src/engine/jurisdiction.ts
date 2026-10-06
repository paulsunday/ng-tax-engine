import { StateAuthorityRepository } from "../rules/StateAuthorityRepository";
import { JurisdictionObligation, MultiStateCompanyInput } from "../types/jurisdiction";
import { ApplicabilityResult } from "../types/common";

/**
 * Jurisdiction engine (brief §1-3, §12-18, §26).
 *
 * Builds the FULL jurisdiction matrix for a company: federal obligations (once, from the
 * federal applicability engine) PLUS a separate set of state-level obligations for EVERY
 * distinct state the company actually touches — head office, each branch, and each
 * employee's state of residence. It deliberately never collapses a multi-state company
 * down to "registered state only" (brief §2's explicit prohibition), and it never invents
 * a specific state levy for a state whose revenue law hasn't actually been researched —
 * where the state's directory entry is not FULLY_RESEARCHED, the obligation is listed as
 * "potentially applicable, source unverified" rather than silently assumed away or guessed.
 */
export function buildJurisdictionMatrix(
  company: MultiStateCompanyInput,
  federalApplicability: ApplicabilityResult[],
  stateAuthorities: StateAuthorityRepository
): JurisdictionObligation[] {
  const obligations: JurisdictionObligation[] = [];

  // 1. Federal layer — one row per applicable federal tax, independent of how many states are touched.
  for (const fed of federalApplicability.filter((a) => a.applicable)) {
    obligations.push({
      jurisdictionLevel: "FEDERAL",
      obligationLabel: fed.taxType,
      reason: fed.reason,
      confidence: fed.confidence,
    });
  }

  // 2. Determine every distinct state actually touched, and WHY (brief §2's worked example).
  const touchedStates = new Map<string, string[]>(); // stateCode -> reasons
  const addTouch = (stateCode: string, reason: string) => {
    if (!touchedStates.has(stateCode)) touchedStates.set(stateCode, []);
    touchedStates.get(stateCode)!.push(reason);
  };

  addTouch(company.headOfficeStateCode, `${company.name}'s registered head office is in this state.`);
  for (const branch of company.branches) {
    addTouch(branch.stateCode, `${company.name} operates a branch here ("${branch.label}").`);
  }
  for (const emp of company.employees) {
    addTouch(emp.stateOfResidenceCode, `Employee "${emp.fullName}" resides here (drives PAYE jurisdiction).`);
    if (emp.stateOfWorkCode !== emp.stateOfResidenceCode) {
      addTouch(
        emp.stateOfWorkCode,
        `Employee "${emp.fullName}" WORKS here but resides in a different state — flagged for review: ` +
          `jurisdiction for PAYE is being assigned by residence, consistent with historical PITA practice, but the ` +
          `work-state vs residence-state distinction for this employee has not been independently confirmed under ` +
          `current law and should be reviewed by a tax professional.`
      );
    }
  }

  // 3. For each touched state, emit state-level obligations, honestly scoped to what's verified.
  for (const [stateCode, reasons] of touchedStates) {
    const profile = stateAuthorities.get(stateCode);
    if (!profile) {
      obligations.push({
        jurisdictionLevel: "STATE",
        stateCode,
        obligationLabel: "UNKNOWN — no directory entry",
        reason: `${reasons.join(" ")} No state revenue authority record exists for code "${stateCode}" — this is a data gap, not a tax-law conclusion. Add a directory row before relying on this jurisdiction.`,
        confidence: "MISSING_REGULATORY_INFORMATION",
      });
      continue;
    }

    const employeesHere = company.employees.filter((e) => e.stateOfResidenceCode === stateCode);
    if (employeesHere.length > 0) {
      obligations.push({
        jurisdictionLevel: "STATE",
        stateCode,
        stateName: profile.state_name,
        obligationLabel: "PAYE",
        reason:
          `${employeesHere.length} employee(s) resident in ${profile.state_name} — PAYE administered by ${profile.revenue_authority_name}. ` +
          `Band rates and reliefs come from the federal Fourth Schedule (verified); the AUTHORITY and filing channel ` +
          `shown here reflect directory verification status "${profile.verification_status}".`,
        confidence: profile.verification_status === "FULLY_RESEARCHED" ? "VERIFIED_RULE" : "REQUIRES_REVIEW",
        authorityVerificationStatus: profile.verification_status,
      });
    }

    const hasPresenceHere =
      stateCode === company.headOfficeStateCode ||
      company.branches.some((b) => b.stateCode === stateCode && b.hasBusinessPremises);
    if (hasPresenceHere) {
      if (profile.verification_status === "FULLY_RESEARCHED") {
        obligations.push({
          jurisdictionLevel: "STATE",
          stateCode,
          stateName: profile.state_name,
          obligationLabel: "Business-related state levies (business premises, land use charge, other)",
          reason:
            `${reasons.join(" ")} ${profile.revenue_authority_name} administers business-related state levies here. ` +
            `Specific levies observed on the official site: ${(profile.other_levies_observed ?? []).join(", ") || "none listed"}. ` +
            `Exact amounts/thresholds still require per-levy verification — see state_profiles.json for what's confirmed vs open.`,
          confidence: "REQUIRES_REVIEW",
          authorityVerificationStatus: profile.verification_status,
        });
      } else {
        obligations.push({
          jurisdictionLevel: "STATE",
          stateCode,
          stateName: profile.state_name,
          obligationLabel: "Business-related state levies (business premises, land use charge, other)",
          reason:
            `${reasons.join(" ")} Current official regulatory source could not be verified for ${profile.state_name} ` +
            `(directory status: ${profile.verification_status}). Do not guess this state's rules from another state's ` +
            `rules or a national default — brief §31. A full research pass equivalent to Enugu's is required before ` +
            `this obligation can be quantified.`,
          confidence: "MISSING_REGULATORY_INFORMATION",
          authorityVerificationStatus: profile.verification_status,
        });
      }
    }
  }

  return obligations;
}

/** Groups the matrix by jurisdiction for a dashboard like the brief's §18 worked example. */
export function groupMatrixForDashboard(matrix: JurisdictionObligation[]): Record<string, JurisdictionObligation[]> {
  const grouped: Record<string, JurisdictionObligation[]> = { FEDERAL: [] };
  for (const o of matrix) {
    const key = o.jurisdictionLevel === "FEDERAL" ? "FEDERAL" : `${o.stateName ?? o.stateCode}`;
    (grouped[key] ??= []).push(o);
  }
  return grouped;
}

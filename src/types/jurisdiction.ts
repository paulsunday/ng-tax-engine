import { ConfidenceLevel } from "./common";

export type AuthorityVerificationStatus = "FULLY_RESEARCHED" | "WEBSITE_CONFIRMED" | "LOCATED_SECONDARY_SOURCE_UNVERIFIED";

export interface StateAuthorityProfile {
  state_code: string;
  state_name: string;
  revenue_authority_name: string;
  official_website?: string | null;
  taxpayer_portal?: string | null;
  taxpayer_id_scheme?: string | null;
  api_available?: boolean | null;
  api_documentation_url?: string | null;
  api_notes?: string | null;
  electronic_receipting?: string | null;
  approved_payment_gateways?: string[];
  applicable_laws?: string[];
  business_related_taxes_observed?: string[];
  other_levies_observed?: string[];
  filing_deadlines?: string;
  payment_deadlines?: string;
  penalties_interest?: string;
  exemptions?: string;
  tax_clearance_certificate?: string;
  verification_status: AuthorityVerificationStatus;
  verified_by?: string;
  last_verified?: string;
  source_urls?: string[];
}

export interface BranchInput {
  id: string;
  label: string;
  stateCode: string;
  hasBusinessPremises: boolean;
  businessActivity?: string;
}

export interface EmployeeJurisdictionInput {
  id: string;
  fullName: string;
  stateOfResidenceCode: string;
  stateOfWorkCode: string;
  branchId?: string | null;
}

export interface MultiStateCompanyInput {
  id: string;
  name: string;
  headOfficeStateCode: string;
  branches: BranchInput[];
  employees: EmployeeJurisdictionInput[];
}

export type JurisdictionLevel = "FEDERAL" | "STATE";

export interface JurisdictionObligation {
  jurisdictionLevel: JurisdictionLevel;
  stateCode?: string;
  stateName?: string;
  obligationLabel: string; // e.g. "PAYE", "Business premises / other state levies"
  reason: string;
  confidence: ConfidenceLevel;
  authorityVerificationStatus?: AuthorityVerificationStatus;
}

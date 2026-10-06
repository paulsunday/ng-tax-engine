import { ApplicabilityResult, CompanyProfile } from "../types/common";

export type DocumentBasis = "STATUTORY" | "REGISTRATION" | "AUDIT_STANDARD";

export interface RequiredDocumentItem {
  code: string;
  label: string;
  purpose: string; // "ONBOARDING" | "CIT" | "VAT" | "WHT" | "PAYE" | "DEVELOPMENT_LEVY" | "AUDIT"
  mandatory: boolean;
  basis: DocumentBasis;
  sourceReference?: string; // only populated for STATUTORY items — never fabricated for the others
  notes?: string;
}

/**
 * Required-documents checklist shown at company registration (brief §8 "required
 * information" / "required supporting documents", §27 filing validation).
 *
 * Every item is tagged with its basis so the UI never implies a statutory citation that
 * doesn't exist:
 *   STATUTORY       — the document is named or clearly implied by a specific NTA/NTAA/
 *                      WHT-Regulation provision (sourceReference populated).
 *   REGISTRATION    — standard Nigerian company-registration evidence (CAC-issued), not
 *                      itself a tax-statute citation.
 *   AUDIT_STANDARD  — generally accepted audit/accounting evidence that a competent audit
 *                      cannot be performed without, but which is professional practice
 *                      rather than a specific statutory requirement — labelled as such so
 *                      it is never confused with a legal filing requirement.
 *
 * This list intentionally does NOT invent pension/NHITF/ITF document requirements or any
 * other scheme this research pass did not verify — those remain open items.
 */
export function getRequiredDocuments(
  company: CompanyProfile,
  applicability: ApplicabilityResult[]
): RequiredDocumentItem[] {
  const isApplicable = (tax: string) => applicability.find((a) => a.taxType === tax)?.applicable === true;
  const items: RequiredDocumentItem[] = [];

  // ---- Always required at onboarding: company identity & registration ----
  items.push(
    { code: "CAC_CERT_INCORPORATION", label: "CAC Certificate of Incorporation", purpose: "ONBOARDING", mandatory: true, basis: "REGISTRATION" },
    { code: "CAC_STATUS_REPORT", label: "CAC Status Report / Memorandum & Articles of Association (or Company Status Report)", purpose: "ONBOARDING", mandatory: true, basis: "REGISTRATION" },
    { code: "TIN_CERTIFICATE", label: "Tax Identification Number (Tax ID) certificate", purpose: "ONBOARDING", mandatory: true, basis: "STATUTORY", sourceReference: "NTAA s.7-8 — issuance and use of Tax ID" },
    { code: "DIRECTORS_SHAREHOLDERS_LIST", label: "List of directors and shareholders (CAC filing)", purpose: "ONBOARDING", mandatory: true, basis: "REGISTRATION" },
    { code: "REGISTERED_ADDRESS_EVIDENCE", label: "Evidence of registered business address (utility bill / tenancy agreement)", purpose: "ONBOARDING", mandatory: true, basis: "REGISTRATION" }
  );

  if (!company.isResident) {
    items.push({
      code: "NONRESIDENT_TAXABLE_PRESENCE_EVIDENCE",
      label: "Evidence of Nigerian taxable presence / appointed tax representative",
      purpose: "ONBOARDING",
      mandatory: true,
      basis: "STATUTORY",
      sourceReference: "NTAA s.6 — non-resident person registration",
    });
  }

  // ---- CIT (always applicable — every company must file, brief/NTAA s.11(1)) ----
  if (company.isProfessionalServices || company.turnoverNgn > 0) {
    items.push(
      company.turnoverNgn <= 50_000_000 && company.fixedAssetsNgn <= 250_000_000 && !company.isProfessionalServices
        ? {
            code: "ATTESTED_STATEMENT_OF_ACCOUNTS",
            label: "Attested statement of accounts (in lieu of audited financial statements, available to small companies)",
            purpose: "CIT",
            mandatory: true,
            basis: "STATUTORY",
            sourceReference: "NTAA s.11(1)(b) proviso",
          }
        : {
            code: "AUDITED_FINANCIAL_STATEMENTS",
            label: "Audited financial statements for the accounting year",
            purpose: "CIT",
            mandatory: true,
            basis: "STATUTORY",
            sourceReference: "NTAA s.11(1)(b)",
          }
    );
  }
  items.push(
    { code: "CIT_SELF_ASSESSMENT_FORM", label: "Completed CIT self-assessment form", purpose: "CIT", mandatory: true, basis: "STATUTORY", sourceReference: "NTAA s.11(1)(a)" },
    { code: "CAPITAL_ALLOWANCE_COMPUTATION", label: "Capital allowance computation / tax fixed-asset register (kept separate from the accounting depreciation schedule)", purpose: "CIT", mandatory: true, basis: "STATUTORY", sourceReference: "NTAA s.11(1)(b); NTA First Schedule Part I" },
    { code: "TAX_LOSS_SCHEDULE", label: "Tax loss carry-forward schedule, if applicable", purpose: "CIT", mandatory: false, basis: "STATUTORY", sourceReference: "NTA s.27(5)-(6)" },
    { code: "PRIOR_YEAR_TAX_RETURN", label: "Prior year's filed tax return and receipt, if this is not the first filing", purpose: "CIT", mandatory: false, basis: "AUDIT_STANDARD" },
    { code: "EVIDENCE_OF_TAX_PAYMENT", label: "Evidence of tax payment for the period", purpose: "CIT", mandatory: true, basis: "STATUTORY", sourceReference: "NTAA s.11(1)(c)" }
  );

  // ---- Development Levy — same return package as CIT, no extra documents identified ----
  if (isApplicable("DEVELOPMENT_LEVY")) {
    items.push({
      code: "DEVELOPMENT_LEVY_COMPUTATION",
      label: "Development Levy computation (assessable profit basis)",
      purpose: "DEVELOPMENT_LEVY",
      mandatory: true,
      basis: "STATUTORY",
      sourceReference: "NTA s.59",
    });
  }

  // ---- VAT ----
  if (isApplicable("VAT")) {
    items.push(
      { code: "VAT_REGISTRATION_CERT", label: "VAT registration certificate", purpose: "VAT", mandatory: true, basis: "STATUTORY", sourceReference: "NTAA s.4; s.22" },
      { code: "SALES_PURCHASES_LEDGER", label: "Sales and purchases ledger evidencing taxable, exempt and zero-rated supplies", purpose: "VAT", mandatory: true, basis: "AUDIT_STANDARD" },
      { code: "VAT_INVOICES_ISSUED", label: "VAT invoices issued to customers for the period", purpose: "VAT", mandatory: true, basis: "STATUTORY", sourceReference: "NTA s.146 (invoicing requirement), NTAA s.22(3)" },
      { code: "INPUT_VAT_INVOICES", label: "Input VAT invoices/receipts from suppliers supporting input VAT claimed", purpose: "VAT", mandatory: true, basis: "AUDIT_STANDARD" }
    );
  }

  // ---- WHT (every company that pays suppliers is potentially an agent) ----
  items.push(
    { code: "WHT_CREDIT_NOTES_RECEIVED", label: "WHT credit notes received from customers (for claiming WHT tax credit)", purpose: "WHT", mandatory: false, basis: "STATUTORY", sourceReference: "Deduction of Tax at Source (Withholding) Regulations 2024, Reg.8" },
    { code: "WHT_REMITTANCE_SCHEDULES", label: "Monthly WHT remittance schedules and receipts issued to suppliers", purpose: "WHT", mandatory: true, basis: "STATUTORY", sourceReference: "WHT Regs 2024, Reg.7-8" },
    { code: "VENDOR_CONTRACTS_INVOICES", label: "Vendor/supplier contracts and invoices, categorised by transaction type", purpose: "WHT", mandatory: true, basis: "AUDIT_STANDARD" }
  );

  // ---- PAYE ----
  if (isApplicable("PAYE")) {
    items.push(
      { code: "PAYROLL_REGISTER", label: "Payroll register for all employees (gross pay, reliefs, deductions, net pay)", purpose: "PAYE", mandatory: true, basis: "STATUTORY", sourceReference: "NTAA s.14(2)" },
      { code: "EMPLOYEE_TIN_NIN_RECORDS", label: "Employee TIN/NIN records", purpose: "PAYE", mandatory: true, basis: "AUDIT_STANDARD" },
      { code: "EMPLOYEE_RENT_DECLARATIONS", label: "Employee rent declarations/evidence supporting rent relief claims", purpose: "PAYE", mandatory: false, basis: "STATUTORY", sourceReference: "NTA s.30(2)(a)(vi)" },
      { code: "EMPLOYEE_STATE_OF_RESIDENCE_LIST", label: "List of employees by state of residence (drives PAYE jurisdiction)", purpose: "PAYE", mandatory: true, basis: "AUDIT_STANDARD" }
    );
  }

  // ---- General audit-evidence documents (not tax-statute items; standard audit practice) ----
  items.push(
    { code: "TRIAL_BALANCE", label: "Trial balance for the period under review", purpose: "AUDIT", mandatory: true, basis: "AUDIT_STANDARD" },
    { code: "GENERAL_LEDGER", label: "General ledger / accounting system extract", purpose: "AUDIT", mandatory: true, basis: "AUDIT_STANDARD" },
    { code: "BANK_STATEMENTS_RECONCILIATIONS", label: "Bank statements and reconciliations for all accounts", purpose: "AUDIT", mandatory: true, basis: "AUDIT_STANDARD" },
    { code: "FIXED_ASSET_REGISTER_ACCOUNTING", label: "Accounting fixed-asset/depreciation register (distinct from the tax capital-allowance register above)", purpose: "AUDIT", mandatory: true, basis: "AUDIT_STANDARD" },
    { code: "INVENTORY_LISTING", label: "Inventory/stock listing as at period end, where applicable", purpose: "AUDIT", mandatory: false, basis: "AUDIT_STANDARD" },
    { code: "RELATED_PARTY_DISCLOSURES", label: "Related-party transaction disclosures", purpose: "AUDIT", mandatory: true, basis: "AUDIT_STANDARD" },
    { code: "PRIOR_YEAR_FINANCIALS", label: "Prior year financial statements (for comparatives)", purpose: "AUDIT", mandatory: false, basis: "AUDIT_STANDARD" },
    { code: "BOARD_RESOLUTIONS", label: "Relevant board resolutions (e.g. approving financial statements, dividend declarations)", purpose: "AUDIT", mandatory: false, basis: "AUDIT_STANDARD" }
  );

  return items;
}

/** Groups a flat checklist by purpose, for a tabbed onboarding UI. */
export function groupByPurpose(items: RequiredDocumentItem[]): Record<string, RequiredDocumentItem[]> {
  return items.reduce((acc, item) => {
    (acc[item.purpose] ??= []).push(item);
    return acc;
  }, {} as Record<string, RequiredDocumentItem[]>);
}

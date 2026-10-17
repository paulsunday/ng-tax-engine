/**
 * Default chart of accounts offered to a newly-created company. This is standard
 * bookkeeping structure (application design), not a cited statutory rule — unlike the tax
 * engine, nothing here needs a source reference. A company can rename/add/deactivate
 * accounts afterwards; these are only the starting seed, flagged isSystemAccount so the UI
 * can warn before deleting one that other modules (invoices, payroll, etc.) post to by code.
 */
import { AccountType } from "@prisma/client";

export interface DefaultAccountSeed {
  code: string;
  name: string;
  type: AccountType;
}

export const DEFAULT_CHART_OF_ACCOUNTS: DefaultAccountSeed[] = [
  // Assets
  { code: "1000", name: "Cash and Cash Equivalents", type: "ASSET" },
  { code: "1010", name: "Bank Accounts", type: "ASSET" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET" },
  { code: "1110", name: "VAT Recoverable (Input VAT)", type: "ASSET" },
  { code: "1200", name: "Inventory", type: "ASSET" },
  { code: "1300", name: "Prepayments", type: "ASSET" },
  { code: "1500", name: "Fixed Assets", type: "ASSET" },
  { code: "1510", name: "Accumulated Depreciation", type: "ASSET" }, // contra-asset, kept as ASSET type with a credit-normal balance by convention

  // Liabilities
  { code: "2000", name: "Accounts Payable", type: "LIABILITY" },
  { code: "2100", name: "VAT Payable", type: "LIABILITY" },
  { code: "2110", name: "WHT Payable", type: "LIABILITY" },
  { code: "2120", name: "PAYE Payable", type: "LIABILITY" },
  { code: "2130", name: "Company Income Tax Payable", type: "LIABILITY" },
  { code: "2140", name: "Development Levy Payable", type: "LIABILITY" },
  { code: "2200", name: "Accrued Expenses", type: "LIABILITY" },
  { code: "2300", name: "Loans Payable", type: "LIABILITY" },

  // Equity
  { code: "3000", name: "Share Capital", type: "EQUITY" },
  { code: "3100", name: "Retained Earnings", type: "EQUITY" },
  { code: "3200", name: "Drawings", type: "EQUITY" }, // contra-equity (debit-normal movement), owner/director withdrawals

  // Revenue
  { code: "4000", name: "Sales Revenue", type: "REVENUE" },
  { code: "4900", name: "Other Income", type: "REVENUE" },

  // Expenses
  { code: "5000", name: "Cost of Sales", type: "EXPENSE" },
  { code: "6000", name: "Salaries and Wages", type: "EXPENSE" },
  { code: "6100", name: "Rent", type: "EXPENSE" },
  { code: "6200", name: "Utilities", type: "EXPENSE" },
  { code: "6300", name: "Professional Fees", type: "EXPENSE" },
  { code: "6400", name: "Depreciation Expense", type: "EXPENSE" },
  { code: "6500", name: "Office Supplies", type: "EXPENSE" },
  { code: "6900", name: "Other Operating Expenses", type: "EXPENSE" },
];

/** Account codes referenced by auto-posting logic (invoices/expenses/assets). Kept as named
 * lookups rather than scattering the literal "1100" through the codebase. */
export const SYSTEM_ACCOUNT_CODES = {
  ACCOUNTS_RECEIVABLE: "1100",
  VAT_RECOVERABLE: "1110",
  ACCOUNTS_PAYABLE: "2000",
  VAT_PAYABLE: "2100",
  FIXED_ASSETS: "1500",
  ACCUMULATED_DEPRECIATION: "1510",
  SALES_REVENUE: "4000",
  DEPRECIATION_EXPENSE: "6400",
  CASH: "1000",
  DRAWINGS: "3200",
} as const;

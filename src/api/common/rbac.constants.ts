/**
 * Permission keys (brief §5). Stored as DB rows (see Permission model) so new permissions
 * can be added without a code deploy — these constants exist only so controllers/guards
 * reference a typo-proof key, not because permissions are hardcoded logic.
 */
export const PERMISSIONS = {
  VIEW_TRANSACTIONS: "transactions.view",
  CREATE_TRANSACTIONS: "transactions.create",
  EDIT_TRANSACTIONS: "transactions.edit",
  DELETE_TRANSACTIONS: "transactions.delete",
  APPROVE_TRANSACTIONS: "transactions.approve",
  IMPORT_BANK_STATEMENTS: "bank.import",
  RECONCILE_TRANSACTIONS: "bank.reconcile",
  RUN_AUDIT: "audit.run",
  CREATE_ADJUSTMENTS: "audit.adjustments.create",
  APPROVE_ADJUSTMENTS: "audit.adjustments.approve",
  CALCULATE_TAXES: "tax.calculate",
  PREPARE_RETURNS: "tax.returns.prepare",
  APPROVE_TAX_FILING: "tax.filing.approve",
  SUBMIT_TAX_FILING: "tax.filing.submit",
  VIEW_TAX_HISTORY: "tax.history.view",
  MANAGE_USERS: "org.users.manage",
  MANAGE_COMPANY_SETTINGS: "org.settings.manage",
  MANAGE_TAX_CONFIGURATION: "org.tax_config.manage",
  VIEW_AUDIT_LOGS: "org.audit_logs.view",
  EXPORT_REPORTS: "reports.export",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** System role names (brief §5). */
export const ROLES = {
  PLATFORM_ADMIN: "PLATFORM_ADMIN",
  COMPANY_OWNER: "COMPANY_OWNER",
  COMPANY_ADMIN: "COMPANY_ADMIN",
  ACCOUNTANT: "ACCOUNTANT",
  AUDITOR: "AUDITOR",
  TAX_OFFICER: "TAX_OFFICER",
  FINANCE_MANAGER: "FINANCE_MANAGER",
  MANAGEMENT_APPROVER: "MANAGEMENT_APPROVER",
  EMPLOYEE: "EMPLOYEE",
  READ_ONLY: "READ_ONLY",
} as const;

/**
 * Default permission grants per system role. This is an application-design decision
 * (least-privilege defaults for each job function), not a legal/statutory fact — unlike
 * the tax engine, nothing here needs a cited source. Organizations can be given a UI to
 * customize this later (out of scope for Phase 1).
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  [ROLES.PLATFORM_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.COMPANY_OWNER]: Object.values(PERMISSIONS),
  [ROLES.COMPANY_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.ACCOUNTANT]: [
    PERMISSIONS.VIEW_TRANSACTIONS,
    PERMISSIONS.CREATE_TRANSACTIONS,
    PERMISSIONS.EDIT_TRANSACTIONS,
    PERMISSIONS.IMPORT_BANK_STATEMENTS,
    PERMISSIONS.RECONCILE_TRANSACTIONS,
    PERMISSIONS.CREATE_ADJUSTMENTS,
    PERMISSIONS.CALCULATE_TAXES,
    PERMISSIONS.PREPARE_RETURNS,
    PERMISSIONS.VIEW_TAX_HISTORY,
    PERMISSIONS.EXPORT_REPORTS,
  ],
  [ROLES.AUDITOR]: [
    PERMISSIONS.VIEW_TRANSACTIONS,
    PERMISSIONS.RUN_AUDIT,
    PERMISSIONS.CREATE_ADJUSTMENTS,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.VIEW_TAX_HISTORY,
    PERMISSIONS.EXPORT_REPORTS,
  ],
  [ROLES.TAX_OFFICER]: [
    PERMISSIONS.VIEW_TRANSACTIONS,
    PERMISSIONS.CALCULATE_TAXES,
    PERMISSIONS.PREPARE_RETURNS,
    PERMISSIONS.SUBMIT_TAX_FILING,
    PERMISSIONS.VIEW_TAX_HISTORY,
    PERMISSIONS.EXPORT_REPORTS,
  ],
  [ROLES.FINANCE_MANAGER]: [
    PERMISSIONS.VIEW_TRANSACTIONS,
    PERMISSIONS.APPROVE_TRANSACTIONS,
    PERMISSIONS.APPROVE_ADJUSTMENTS,
    PERMISSIONS.APPROVE_TAX_FILING,
    PERMISSIONS.VIEW_TAX_HISTORY,
    PERMISSIONS.MANAGE_COMPANY_SETTINGS,
    PERMISSIONS.EXPORT_REPORTS,
  ],
  [ROLES.MANAGEMENT_APPROVER]: [
    PERMISSIONS.APPROVE_TRANSACTIONS,
    PERMISSIONS.APPROVE_ADJUSTMENTS,
    PERMISSIONS.APPROVE_TAX_FILING,
  ],
  [ROLES.EMPLOYEE]: [PERMISSIONS.VIEW_TRANSACTIONS],
  [ROLES.READ_ONLY]: [PERMISSIONS.VIEW_TRANSACTIONS, PERMISSIONS.VIEW_TAX_HISTORY, PERMISSIONS.EXPORT_REPORTS],
};

export interface JwtPayload {
  sub: string; // userId
  email: string;
  organizationId: string | null;
  roleId: string | null;
  roleName: string | null;
  isPlatformAdmin: boolean;
  // Cross-tenant, same axis as isPlatformAdmin — see User.isTaxRuleApprover.
  isTaxRuleApprover: boolean;
}

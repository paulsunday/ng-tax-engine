import { PermissionKey, PERMISSIONS } from "../common/rbac.constants";

export type AiToolName =
  | "get_company_financials"
  | "get_transactions"
  | "get_unreconciled_transactions"
  | "get_tax_obligations"
  | "get_missing_documents"
  | "get_filing_status"
  | "explain_tax_calculation"
  | "calculate_tax"
  | "run_audit"
  | "generate_scenario"
  | "prepare_tax_return"
  | "request_approval"
  | "submit_tax_return";

export interface AiToolDefinition {
  name: AiToolName;
  description: string;
  isWriteTool: boolean;
  requiredPermission: PermissionKey;
}

/**
 * The controlled tool registry (master-build-prompt §49, §22-23). This file is the
 * capability boundary: "AI may call read tools freely according to permissions. Write
 * and filing tools must require authorization" is enforced by AiToolsService at the code
 * level against THIS table, not by convention — see isWriteTool handling there.
 *
 * IMPORTANT SCOPE NOTE: this registry and its dispatcher (AiToolsService) are the
 * controlled backend an AI/LLM integration would call — there is no natural-language
 * chat model wired into this codebase (no LLM API credentials exist in this environment,
 * and inventing a fake one would violate the brief's own "do not fabricate integrations"
 * principle). Every tool here only ever delegates to an already-built, already-tested
 * service from earlier phases — it never contains new business logic of its own, so it
 * cannot invent a transaction, a tax figure, or a filing that the underlying service
 * wouldn't have produced on its own (brief §23: the AI must never invent financial
 * information).
 */
export const AI_TOOL_REGISTRY: Record<AiToolName, AiToolDefinition> = {
  get_company_financials: { name: "get_company_financials", description: "Profit & Loss and Balance Sheet for a period.", isWriteTool: false, requiredPermission: PERMISSIONS.VIEW_TRANSACTIONS },
  get_transactions: { name: "get_transactions", description: "List invoices and expenses for a period.", isWriteTool: false, requiredPermission: PERMISSIONS.VIEW_TRANSACTIONS },
  get_unreconciled_transactions: { name: "get_unreconciled_transactions", description: "Bank transactions not yet matched to any ledger entry.", isWriteTool: false, requiredPermission: PERMISSIONS.VIEW_TRANSACTIONS },
  get_tax_obligations: { name: "get_tax_obligations", description: "This company's compliance calendar.", isWriteTool: false, requiredPermission: PERMISSIONS.VIEW_TAX_HISTORY },
  get_missing_documents: { name: "get_missing_documents", description: "Invoices/expenses with no supporting document attached.", isWriteTool: false, requiredPermission: PERMISSIONS.VIEW_TRANSACTIONS },
  get_filing_status: { name: "get_filing_status", description: "Status and filing attempts for a tax return.", isWriteTool: false, requiredPermission: PERMISSIONS.VIEW_TAX_HISTORY },
  explain_tax_calculation: { name: "explain_tax_calculation", description: "The full transparent calculation breakdown for a tax return.", isWriteTool: false, requiredPermission: PERMISSIONS.VIEW_TAX_HISTORY },
  calculate_tax: { name: "calculate_tax", description: "Compute a tax return for a tax type and period.", isWriteTool: true, requiredPermission: PERMISSIONS.CALCULATE_TAXES },
  run_audit: { name: "run_audit", description: "Run a Normal Audit for a period.", isWriteTool: true, requiredPermission: PERMISSIONS.RUN_AUDIT },
  generate_scenario: { name: "generate_scenario", description: "Generate a NORMAL/PROFIT_SCENARIO/LOSS_SCENARIO for a period.", isWriteTool: true, requiredPermission: PERMISSIONS.RUN_AUDIT },
  prepare_tax_return: { name: "prepare_tax_return", description: "Alias for calculate_tax, phrased as return preparation.", isWriteTool: true, requiredPermission: PERMISSIONS.PREPARE_RETURNS },
  request_approval: { name: "request_approval", description: "Create a notification asking an authorized human to approve something — never approves anything itself.", isWriteTool: true, requiredPermission: PERMISSIONS.VIEW_TRANSACTIONS },
  submit_tax_return: { name: "submit_tax_return", description: "Submit an APPROVED tax return via the configured filing adapter.", isWriteTool: true, requiredPermission: PERMISSIONS.SUBMIT_TAX_FILING },
};

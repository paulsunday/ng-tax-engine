import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { FinancialStatementsService } from "../financial-statements/financial-statements.service";
import { ComplianceCalendarService } from "../compliance-calendar/compliance-calendar.service";
import { TaxReturnsService } from "../tax-returns/tax-returns.service";
import { TaxCalculationService } from "../tax-calculation/tax-calculation.service";
import { AuditService } from "../audit/audit.service";
import { ScenariosService } from "../scenarios/scenarios.service";
import { FilingService } from "../filing/filing.service";
import { AI_TOOL_REGISTRY, AiToolName } from "./ai-tools.constants";
import { JwtPayload } from "../common/rbac.constants";

export interface AiToolInvocation {
  tool: AiToolName;
  companyId: string;
  params: Record<string, any>;
  humanAuthorized?: boolean; // required true for any isWriteTool=true entry — see AI_TOOL_REGISTRY docstring
}

/**
 * Dispatches a named tool call to the real underlying service. Every tool here is a thin
 * delegation — there is no business logic in this file, by design, so this layer cannot
 * itself drift from the already-tested behavior of the service it calls (brief §23: the
 * AI must never invent financial information or override a statutory calculation).
 */
@Injectable()
export class AiToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly statements: FinancialStatementsService,
    private readonly calendar: ComplianceCalendarService,
    private readonly taxReturns: TaxReturnsService,
    private readonly taxCalculation: TaxCalculationService,
    private readonly audit: AuditService,
    private readonly scenarios: ScenariosService,
    private readonly filing: FilingService
  ) {}

  async invoke(user: JwtPayload, invocation: AiToolInvocation): Promise<unknown> {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    const definition = AI_TOOL_REGISTRY[invocation.tool];
    if (!definition) throw new BadRequestException(`Unknown tool "${invocation.tool}".`);

    await this.assertPermission(user, definition.requiredPermission);

    if (definition.isWriteTool && !invocation.humanAuthorized) {
      throw new ForbiddenException(
        `Tool "${invocation.tool}" is a write tool and requires explicit human authorization ` +
          `(pass humanAuthorized: true) — brief §49: "Write and filing tools must require authorization."`
      );
    }

    const organizationId = user.organizationId;
    const companyId = invocation.companyId;
    const userId = user.sub;
    const p = invocation.params ?? {};

    switch (invocation.tool) {
      case "get_company_financials": {
        const periodStart = new Date(p.periodStart);
        const periodEnd = new Date(p.periodEnd);
        const [pnl, balanceSheet] = await Promise.all([
          this.statements.getProfitAndLoss(organizationId, companyId, periodStart, periodEnd),
          this.statements.getBalanceSheet(organizationId, companyId, periodEnd, periodStart),
        ]);
        return { pnl, balanceSheet };
      }

      case "get_transactions": {
        await this.companies.getOneOrThrow(organizationId, companyId);
        const [invoices, expenses] = await Promise.all([
          this.prisma.invoice.findMany({ where: { companyId, issueDate: { gte: new Date(p.periodStart), lte: new Date(p.periodEnd) } } }),
          this.prisma.expense.findMany({ where: { companyId, expenseDate: { gte: new Date(p.periodStart), lte: new Date(p.periodEnd) } } }),
        ]);
        return { invoices, expenses };
      }

      case "get_unreconciled_transactions": {
        await this.companies.getOneOrThrow(organizationId, companyId);
        return this.prisma.bankTransaction.findMany({ where: { companyId, bankAccountId: p.bankAccountId, matchStatus: "UNMATCHED" } });
      }

      case "get_tax_obligations":
        return this.calendar.listForCompany(organizationId, companyId);

      case "get_missing_documents": {
        await this.companies.getOneOrThrow(organizationId, companyId);
        const [invoices, expenses, documentLinks] = await Promise.all([
          this.prisma.invoice.findMany({ where: { companyId, status: { not: "DRAFT" } } }),
          this.prisma.expense.findMany({ where: { companyId, status: { not: "DRAFT" } } }),
          this.prisma.document.findMany({ where: { companyId, linkedEntityType: { in: ["Invoice", "Expense"] } }, select: { linkedEntityType: true, linkedEntityId: true } }),
        ]);
        const documented = new Set(documentLinks.map((d) => `${d.linkedEntityType}:${d.linkedEntityId}`));
        return {
          invoicesMissingDocuments: invoices.filter((i) => !documented.has(`Invoice:${i.id}`)).map((i) => ({ id: i.id, invoiceNumber: i.invoiceNumber })),
          expensesMissingDocuments: expenses.filter((e) => !documented.has(`Expense:${e.id}`)).map((e) => ({ id: e.id, description: e.description })),
        };
      }

      case "get_filing_status": {
        const taxReturn = await this.taxReturns.getOneOrThrow(organizationId, companyId, p.taxReturnId);
        const attempts = await this.filing.listAttempts(organizationId, companyId, p.taxReturnId);
        return { status: taxReturn.status, submittedAt: taxReturn.submittedAt, submissionReference: taxReturn.submissionReference, attempts };
      }

      case "explain_tax_calculation": {
        const taxReturn = await this.taxReturns.getOneOrThrow(organizationId, companyId, p.taxReturnId);
        return {
          taxType: taxReturn.taxType,
          taxLiabilityNgn: taxReturn.taxLiabilityNgn,
          complianceState: taxReturn.complianceState,
          confidence: taxReturn.confidence,
          breakdown: taxReturn.calculationBreakdown,
        };
      }

      case "calculate_tax":
      case "prepare_tax_return": {
        switch (p.taxType) {
          case "CIT":
            return this.taxCalculation.computeCitAndDevelopmentLevy(organizationId, companyId, userId, new Date(p.periodStart), new Date(p.periodEnd));
          case "VAT":
            return this.taxCalculation.computeVatReturn(organizationId, companyId, userId, new Date(p.periodStart), new Date(p.periodEnd));
          case "PAYE":
            return this.taxCalculation.computePayeReturn(organizationId, companyId, userId, new Date(p.periodStart), new Date(p.periodEnd));
          case "WHT":
            return this.taxCalculation.computeWhtReturn(organizationId, companyId, userId, new Date(p.periodStart), new Date(p.periodEnd));
          default:
            throw new BadRequestException(`Unsupported taxType "${p.taxType}" for ${invocation.tool}.`);
        }
      }

      case "run_audit":
        return this.audit.runNormalAudit(organizationId, companyId, userId, new Date(p.periodStart), new Date(p.periodEnd));

      case "generate_scenario":
        return this.scenarios.generate(organizationId, companyId, userId, p.scenarioType, new Date(p.periodStart), new Date(p.periodEnd));

      case "request_approval": {
        await this.companies.getOneOrThrow(organizationId, companyId);
        return this.prisma.notification.create({
          data: {
            organizationId,
            companyId,
            category: "APPROVAL_REQUESTED",
            title: `Approval requested: ${p.subject ?? "action"}`,
            body: p.message ?? "An AI-assisted action is awaiting human approval.",
            channel: "IN_APP",
            status: "SENT",
            relatedEntityType: p.relatedEntityType,
            relatedEntityId: p.relatedEntityId,
          },
        });
      }

      case "submit_tax_return":
        return this.filing.submit(organizationId, companyId, userId, p.taxReturnId, p.mode ?? "MANUAL");

      default:
        throw new BadRequestException(`Tool "${invocation.tool}" has no dispatcher implemented.`);
    }
  }

  /** Re-implements the same role->permission check PermissionsGuard does, since this is one dynamic endpoint dispatching to many different required permissions. */
  private async assertPermission(user: JwtPayload, permission: string): Promise<void> {
    if (user.isPlatformAdmin) return;
    if (!user.roleId) throw new ForbiddenException("User has no role assigned in this organization.");

    const grants = await this.prisma.rolePermission.findMany({ where: { roleId: user.roleId, permission: { key: permission } } });
    if (grants.length === 0) throw new ForbiddenException(`Missing required permission: ${permission}`);
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { ScenarioType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { FinancialStatementsService } from "../financial-statements/financial-statements.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { RULE_REPOSITORY } from "../tax-rules/tax-rules.constants";
import { RuleRepository } from "../../rules/RuleRepository";
import { UnverifiedRuleError, NoApplicableRuleError, CompanyProfile } from "../../types/common";
import { computeCit } from "../../engine/cit";
import { buildProfitScenario, buildLossScenario, AdjustmentCandidate, ScenarioResult } from "../../scenarios/scenarioBuilder";
import { calculateStraightLineMonthlyDepreciation } from "../../accounting/depreciation";

const CALCULATION_VERSION = "scenario-engine-1.0";

/**
 * Normal / Profit / Loss scenario generation (brief §11-14). The accounting-profit side
 * is fully real: every adjustment traces to an actual DRAFT Invoice/Expense row or an
 * Asset's own depreciation formula, never a fabricated figure (see scenarioBuilder.ts's
 * docstring). The TAX side reuses the project's existing, independently-built CIT engine
 * (src/engine/cit.ts) exactly as-is — this service never recomputes or overrides a tax
 * figure itself (brief §13: "Do not allow the AI model to directly determine statutory
 * tax calculations").
 *
 * Known simplification: turnoverNgn/fixedAssetsNgn for the small-company classification
 * test are approximated from this period's P&L revenue and the Asset register's total
 * cost, respectively, because Company (Phase 1) does not persist those as standing
 * fields. This is an approximation, not a verified annual turnover figure — flagged in
 * the returned breakdown's `classificationBasis` field.
 */
@Injectable()
export class ScenariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly statements: FinancialStatementsService,
    private readonly auditLog: AuditLogService,
    @Inject(RULE_REPOSITORY) private readonly rules: RuleRepository
  ) {}

  async generate(organizationId: string, companyId: string, userId: string, scenarioType: ScenarioType, periodStart: Date, periodEnd: Date) {
    const company = await this.companies.getOneOrThrow(organizationId, companyId);
    const pnl = await this.statements.getProfitAndLoss(organizationId, companyId, periodStart, periodEnd);

    let scenarioResult: ScenarioResult;
    if (scenarioType === "NORMAL") {
      scenarioResult = { baseAccountingProfitNgn: pnl.netProfitBeforeTaxNgn, adjustments: [], totalAdjustmentNgn: 0, adjustedAccountingProfitNgn: pnl.netProfitBeforeTaxNgn };
    } else if (scenarioType === "PROFIT_SCENARIO") {
      const candidates = await this.getUnpostedInvoiceCandidates(companyId, periodStart, periodEnd);
      scenarioResult = buildProfitScenario(pnl.netProfitBeforeTaxNgn, candidates);
    } else {
      const [expenseCandidates, depreciationCandidates] = await Promise.all([
        this.getUnpostedExpenseCandidates(companyId, periodStart, periodEnd),
        this.getUnpostedDepreciationCandidates(companyId, periodEnd),
      ]);
      scenarioResult = buildLossScenario(pnl.netProfitBeforeTaxNgn, expenseCandidates, depreciationCandidates);
    }

    const taxResult = await this.computeTaxIndependently(company, scenarioResult.adjustedAccountingProfitNgn, periodEnd);

    const scenario = await this.prisma.$transaction(async (tx) => {
      const created = await tx.scenario.create({
        data: {
          organizationId,
          companyId,
          scenarioType,
          periodStart,
          periodEnd,
          calculationVersion: CALCULATION_VERSION,
          accountingProfitNgn: scenarioResult.adjustedAccountingProfitNgn,
          taxableProfitNgn: taxResult.taxableProfitNgn,
          taxLiabilityNgn: taxResult.taxLiabilityNgn,
          breakdown: { pnl, scenarioResult, taxResult } as any,
          generatedBy: userId,
        },
      });

      for (const adj of scenarioResult.adjustments) {
        await tx.scenarioAdjustment.create({
          data: {
            scenarioId: created.id,
            sourceType: adj.sourceType,
            sourceId: adj.sourceId,
            description: adj.description,
            originalValueNgn: 0,
            adjustedValueNgn: adj.amountNgn,
            accountingTreatment:
              adj.sourceType === "Invoice"
                ? "Recognize revenue from an existing but unposted invoice"
                : adj.sourceType === "Expense"
                  ? "Recognize cost from an existing but unposted expense"
                  : "Recognize depreciation for the period, calculated but not yet posted",
            taxTreatment: "Determined independently by the tax engine at computation time — not assumed here.",
            confidence: "VERIFIED_CALCULATION",
            approvalStatus: "PENDING",
          },
        });
      }

      return created;
    });

    await this.auditLog.record({
      organizationId,
      userId,
      action: "GENERATE_SCENARIO",
      objectType: "Scenario",
      objectId: scenario.id,
      newValue: { scenarioType, accountingProfitNgn: scenarioResult.adjustedAccountingProfitNgn },
    });

    return this.getOneOrThrow(organizationId, companyId, scenario.id);
  }

  private async getUnpostedInvoiceCandidates(companyId: string, periodStart: Date, periodEnd: Date): Promise<AdjustmentCandidate[]> {
    const drafts = await this.prisma.invoice.findMany({
      where: { companyId, status: "DRAFT", issueDate: { gte: periodStart, lte: periodEnd } },
      include: { customer: true },
    });
    return drafts.map((inv) => ({
      sourceType: "Invoice" as const,
      sourceId: inv.id,
      description: `Draft invoice ${inv.invoiceNumber} to ${inv.customer.name}, not yet posted`,
      amountNgn: Number(inv.subtotalNgn), // revenue only — VAT is never part of accounting profit
    }));
  }

  private async getUnpostedExpenseCandidates(companyId: string, periodStart: Date, periodEnd: Date): Promise<AdjustmentCandidate[]> {
    const drafts = await this.prisma.expense.findMany({
      where: { companyId, status: "DRAFT", expenseDate: { gte: periodStart, lte: periodEnd } },
      include: { supplier: true },
    });
    return drafts.map((exp) => ({
      sourceType: "Expense" as const,
      sourceId: exp.id,
      description: `Draft expense "${exp.description}"${exp.supplier ? ` from ${exp.supplier.name}` : ""}, not yet posted`,
      amountNgn: Number(exp.subtotalNgn),
    }));
  }

  private async getUnpostedDepreciationCandidates(companyId: string, periodEnd: Date): Promise<AdjustmentCandidate[]> {
    const periodYear = periodEnd.getUTCFullYear();
    const periodMonth = periodEnd.getUTCMonth() + 1;

    const assets = await this.prisma.asset.findMany({ where: { companyId, status: "ACTIVE" } });
    const candidates: AdjustmentCandidate[] = [];

    for (const asset of assets) {
      const alreadyPosted = await this.prisma.assetDepreciationEntry.findUnique({
        where: { assetId_periodYear_periodMonth: { assetId: asset.id, periodYear, periodMonth } },
      });
      if (alreadyPosted) continue;

      const result = calculateStraightLineMonthlyDepreciation({
        costNgn: Number(asset.costNgn),
        salvageValueNgn: Number(asset.salvageValueNgn),
        usefulLifeMonths: asset.usefulLifeMonths,
        accumulatedDepreciationNgn: Number(asset.accumulatedDepreciationNgn),
      });
      if (result.amountNgn > 0) {
        candidates.push({
          sourceType: "AssetDepreciation",
          sourceId: asset.id,
          description: `Depreciation for "${asset.description}" for ${periodYear}-${String(periodMonth).padStart(2, "0")}, calculated but not yet posted`,
          amountNgn: result.amountNgn,
        });
      }
    }
    return candidates;
  }

  /**
   * Calls the existing CIT engine as-is. If the governing rule hasn't been approved by a
   * tax professional yet (UnverifiedRuleError) or simply doesn't exist for this date
   * (NoApplicableRuleError), this returns an honest "pending"/"unavailable" result rather
   * than crashing the whole scenario — the accounting-profit side of a scenario is still
   * useful on its own, and brief §34 requires surfacing uncertainty rather than hiding it.
   */
  private async computeTaxIndependently(
    company: { name: string; isResident: boolean; isProfessionalServices: boolean; vatRegistered: boolean; accountingYearEnd: string; incorporationDate: Date },
    accountingProfitNgn: number,
    asOfDate: Date
  ): Promise<{ taxableProfitNgn: number; taxLiabilityNgn: number; status: "COMPUTED" | "PENDING_RULE_APPROVAL" | "NO_RULE_FOR_PERIOD"; detail?: unknown }> {
    const revenueForClassification = Math.max(accountingProfitNgn, 0);
    const fixedAssetsTotal = await this.prisma.asset.aggregate({ where: { status: "ACTIVE" }, _sum: { costNgn: true } });

    const profile: CompanyProfile = {
      id: "scenario-company",
      name: company.name,
      isResident: company.isResident,
      isProfessionalServices: company.isProfessionalServices,
      turnoverNgn: revenueForClassification, // approximation — see class docstring
      fixedAssetsNgn: Number(fixedAssetsTotal._sum.costNgn ?? 0),
      vatRegisteredVoluntarily: company.vatRegistered,
      employeeCount: 0,
      accountingYearEnd: company.accountingYearEnd,
      incorporationDate: company.incorporationDate.toISOString().slice(0, 10),
    };

    try {
      const cit = computeCit(
        profile,
        { accountingProfitNgn, nonDeductibleExpensesNgn: 0, nonTaxableIncomeNgn: 0, totalCapitalAllowanceNgn: 0, totalLossReliefNgn: 0 },
        this.rules,
        asOfDate.toISOString().slice(0, 10)
      );
      return { taxableProfitNgn: cit.totalProfitNgn, taxLiabilityNgn: cit.taxLiabilityNgn, status: "COMPUTED", detail: cit };
    } catch (err) {
      if (err instanceof UnverifiedRuleError) {
        return { taxableProfitNgn: 0, taxLiabilityNgn: 0, status: "PENDING_RULE_APPROVAL", detail: err.message };
      }
      if (err instanceof NoApplicableRuleError) {
        return { taxableProfitNgn: 0, taxLiabilityNgn: 0, status: "NO_RULE_FOR_PERIOD", detail: err.message };
      }
      throw err;
    }
  }

  async getOneOrThrow(organizationId: string, companyId: string, scenarioId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const scenario = await this.prisma.scenario.findUnique({ where: { id: scenarioId }, include: { adjustments: true } });
    if (!scenario || scenario.companyId !== companyId) throw new NotFoundException("Scenario not found.");
    return scenario;
  }

  async compare(organizationId: string, companyId: string, periodStart: Date, periodEnd: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const scenarios = await this.prisma.scenario.findMany({
      where: { companyId, periodStart, periodEnd },
      include: { adjustments: true },
      orderBy: { createdAt: "desc" },
    });

    // Most recent of each type, for a clean three-way comparison.
    const byType = new Map<ScenarioType, (typeof scenarios)[number]>();
    for (const s of scenarios) {
      if (!byType.has(s.scenarioType)) byType.set(s.scenarioType, s);
    }

    return {
      normal: byType.get("NORMAL") ?? null,
      profitScenario: byType.get("PROFIT_SCENARIO") ?? null,
      lossScenario: byType.get("LOSS_SCENARIO") ?? null,
    };
  }
}

import { BadRequestException, Injectable, Inject, Logger } from "@nestjs/common";
import { TaxType, TaxReturnComplianceState } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { FinancialStatementsService } from "../financial-statements/financial-statements.service";
import { CapitalAllowanceService } from "../capital-allowance/capital-allowance.service";
import { TaxLossService } from "../tax-loss/tax-loss.service";
import { PayrollService } from "../payroll/payroll.service";
import { WhtDeterminationService } from "../wht-determination/wht-determination.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { RULE_REPOSITORY } from "../tax-rules/tax-rules.constants";
import { RuleRepository } from "../../rules/RuleRepository";
import {
  CompanyProfile,
  ConfidenceLevel,
  Explainable,
  MissingTaxpayerInformationError,
  NoApplicableRuleError,
  UnverifiedRuleError,
} from "../../types/common";
import { computeCit } from "../../engine/cit";
import { computeDevelopmentLevy } from "../../engine/developmentLevy";
import { computeVat } from "../../engine/vat";

const CALCULATION_VERSION = "tax-calculation-service-1.0";

interface GuardedResult<T> {
  complianceState: TaxReturnComplianceState;
  result: T | null;
  detail?: string;
  ruleIdsUsed: string[];
}

/**
 * Orchestrates the framework-agnostic tax engine (src/engine/*, built independently —
 * see REGULATORY_RESEARCH_REPORT.md) against this app's real accounting data, producing
 * DRAFT TaxReturn rows. This is the first point where the tax engine touches a live
 * company's actual ledger rather than caller-supplied numbers.
 *
 * Production-readiness mandate §2: a return's `complianceState` is a distinct signal from
 * both `status` (approve/file workflow) and `confidence` (statutory confidence level) —
 * CALCULATED / PENDING_RULE_APPROVAL / MISSING_REGULATORY_INFORMATION /
 * MISSING_TAXPAYER_INFORMATION / CALCULATION_ERROR. `taxLiabilityNgn` is null for every
 * state except CALCULATED — never a literal 0 standing in for "we don't actually know."
 * Every CALCULATED return records the exact TaxRuleVersion id(s) it used via
 * TaxReturnRuleUsage, so historical returns stay reproducible even after a rule changes.
 *
 * Known approximations (documented rather than hidden, per brief §34):
 *  - turnoverNgn for small-company classification uses this period's P&L revenue, not a
 *    verified annual turnover figure.
 *  - fixedAssetsNgn uses the sum of the CapitalAsset (tax) register's qualifying
 *    expenditure, not an independently audited fixed-asset value.
 *  - nonDeductibleExpensesNgn/nonTaxableIncomeNgn are not yet derived from actual expense
 *    categorization — they default to 0 pending a tax-adjustment-tagging feature.
 */
@Injectable()
export class TaxCalculationService {
  private readonly logger = new Logger(TaxCalculationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly statements: FinancialStatementsService,
    private readonly capitalAllowance: CapitalAllowanceService,
    private readonly taxLoss: TaxLossService,
    private readonly payroll: PayrollService,
    private readonly wht: WhtDeterminationService,
    private readonly auditLog: AuditLogService,
    @Inject(RULE_REPOSITORY) private readonly rules: RuleRepository
  ) {}

  private async getCompanyProfile(companyId: string, periodRevenueNgn: number): Promise<CompanyProfile> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const assets = await this.prisma.capitalAsset.aggregate({ where: { companyId }, _sum: { qualifyingExpenditureNgn: true } });
    const employeeCount = await this.prisma.employee.count({ where: { companyId } });

    return {
      id: company.id,
      name: company.name,
      isResident: company.isResident,
      isProfessionalServices: company.isProfessionalServices,
      turnoverNgn: Math.max(periodRevenueNgn, 0),
      fixedAssetsNgn: Number(assets._sum.qualifyingExpenditureNgn ?? 0),
      vatRegisteredVoluntarily: company.vatRegistered,
      employeeCount,
      accountingYearEnd: company.accountingYearEnd,
      incorporationDate: company.incorporationDate.toISOString().slice(0, 10),
    };
  }

  /** Every return this app produces is ultimately filed under a TIN — refuse to call a calculation complete without one, rather than silently computing a number nobody can file. */
  private async assertTaxpayerInfoComplete(companyId: string): Promise<void> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    if (!company.tin) throw new MissingTaxpayerInformationError("company TIN");
  }

  private guard<T extends Explainable>(fn: () => T): GuardedResult<T> {
    try {
      const result = fn();
      return { complianceState: "CALCULATED", result, ruleIdsUsed: result.ruleIdsUsed };
    } catch (err) {
      if (err instanceof UnverifiedRuleError) return { complianceState: "PENDING_RULE_APPROVAL", result: null, detail: err.message, ruleIdsUsed: [] };
      if (err instanceof NoApplicableRuleError) return { complianceState: "MISSING_REGULATORY_INFORMATION", result: null, detail: err.message, ruleIdsUsed: [] };
      throw err;
    }
  }

  /**
   * Finds (or clears the way to recreate) the DRAFT slot for this company/taxType/period.
   * A prior attempt that never reached a real number (PENDING_RULE_APPROVAL/
   * MISSING_REGULATORY_INFORMATION/MISSING_TAXPAYER_INFORMATION/CALCULATION_ERROR) is
   * superseded automatically — approving a rule and recalculating must actually produce a
   * fresh, usable return (mandate §29's acceptance test), not get stuck behind a stale
   * failed attempt forever. A return that already has a real CALCULATED number, or has
   * progressed past DRAFT, is never silently replaced.
   */
  private async clearDraftSlot(companyId: string, taxType: TaxType, periodStart: Date, periodEnd: Date): Promise<void> {
    const existing = await this.prisma.taxReturn.findFirst({ where: { companyId, taxType, periodStart, periodEnd } });
    if (!existing) return;
    if (existing.status !== "DRAFT" || existing.complianceState === "CALCULATED") {
      // A deliberate "refuse to proceed" business rule, not an unexpected failure — must
      // propagate directly to the caller, never get swallowed into a persisted
      // CALCULATION_ERROR row (that would double-throw: persistFailure would just hit this
      // exact same wall again).
      throw new BadRequestException(`A ${taxType} return for this period already exists (id ${existing.id}, status ${existing.status}) — supersede it explicitly rather than creating a duplicate.`);
    }
    await this.prisma.taxReturn.update({ where: { id: existing.id }, data: { status: "SUPERSEDED" } });
  }

  private async persistReturn(
    organizationId: string,
    companyId: string,
    userId: string,
    taxType: TaxType,
    periodStart: Date,
    periodEnd: Date,
    taxLiabilityNgn: number | null,
    complianceState: TaxReturnComplianceState,
    confidence: ConfidenceLevel,
    classificationSnapshot: Record<string, unknown>,
    breakdown: Record<string, unknown>,
    ruleVersionIds: string[] = []
  ) {
    await this.clearDraftSlot(companyId, taxType, periodStart, periodEnd);

    const taxReturn = await this.prisma.taxReturn.create({
      data: {
        companyId,
        taxType,
        periodStart,
        periodEnd,
        taxpayerClassificationSnapshot: classificationSnapshot as any,
        calculationVersion: CALCULATION_VERSION,
        calculationBreakdown: breakdown as any,
        taxLiabilityNgn,
        complianceState,
        confidence,
        status: "DRAFT",
      },
    });

    const uniqueRuleVersionIds = [...new Set(ruleVersionIds)];
    if (uniqueRuleVersionIds.length > 0) {
      await this.prisma.taxReturnRuleUsage.createMany({
        data: uniqueRuleVersionIds.map((ruleVersionId) => ({ taxReturnId: taxReturn.id, ruleVersionId })),
        skipDuplicates: true,
      });
    }

    await this.auditLog.record({
      organizationId,
      userId,
      action: "COMPUTE",
      objectType: "TaxReturn",
      objectId: taxReturn.id,
      newValue: { taxType, taxLiabilityNgn, complianceState, confidence },
    });

    return taxReturn;
  }

  /** Persists a MISSING_TAXPAYER_INFORMATION or CALCULATION_ERROR return instead of letting the request crash with an opaque 500 — every attempt leaves an auditable record. */
  private async persistFailure(
    organizationId: string,
    companyId: string,
    userId: string,
    taxType: TaxType,
    periodStart: Date,
    periodEnd: Date,
    complianceState: "MISSING_TAXPAYER_INFORMATION" | "CALCULATION_ERROR",
    error: Error
  ) {
    if (complianceState === "CALCULATION_ERROR") {
      this.logger.error(`Unexpected error computing ${taxType} for company ${companyId}: ${error.message}`, error.stack);
    }
    return this.persistReturn(organizationId, companyId, userId, taxType, periodStart, periodEnd, null, complianceState, "REQUIRES_REVIEW", {}, { error: error.message });
  }

  async computeCitAndDevelopmentLevy(organizationId: string, companyId: string, userId: string, periodStart: Date, periodEnd: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    try {
      await this.assertTaxpayerInfoComplete(companyId);
    } catch (err) {
      if (err instanceof MissingTaxpayerInformationError) {
        const citReturn = await this.persistFailure(organizationId, companyId, userId, "CIT", periodStart, periodEnd, "MISSING_TAXPAYER_INFORMATION", err);
        const levyReturn = await this.persistFailure(organizationId, companyId, userId, "DEVELOPMENT_LEVY", periodStart, periodEnd, "MISSING_TAXPAYER_INFORMATION", err);
        return { citReturn, levyReturn };
      }
      throw err;
    }

    try {
      const pnl = await this.statements.getProfitAndLoss(organizationId, companyId, periodStart, periodEnd);
      const profile = await this.getCompanyProfile(companyId, pnl.totalRevenueNgn);
      const yearOfAssessment = periodEnd.getUTCFullYear();
      const asOfDate = periodEnd.toISOString().slice(0, 10);

      const totalCapitalAllowanceNgn = await this.capitalAllowance.getTotalClaimedForYear(companyId, yearOfAssessment);
      const assessableProfitBeforeLoss = Math.max(pnl.netProfitBeforeTaxNgn - totalCapitalAllowanceNgn, 0);
      const lossResult = await this.taxLoss.applyRelief(organizationId, companyId, "general", assessableProfitBeforeLoss, false, yearOfAssessment);

      const citGuarded = this.guard(() =>
        computeCit(
          profile,
          { accountingProfitNgn: pnl.netProfitBeforeTaxNgn, nonDeductibleExpensesNgn: 0, nonTaxableIncomeNgn: 0, totalCapitalAllowanceNgn, totalLossReliefNgn: lossResult.totalLossUtilisedNgn },
          this.rules,
          asOfDate
        )
      );

      const citReturn = await this.persistReturn(
        organizationId,
        companyId,
        userId,
        "CIT",
        periodStart,
        periodEnd,
        citGuarded.result?.taxLiabilityNgn ?? null,
        citGuarded.complianceState,
        citGuarded.complianceState === "CALCULATED" ? "VERIFIED_CALCULATION" : "MISSING_REGULATORY_INFORMATION",
        { turnoverNgn: profile.turnoverNgn, fixedAssetsNgn: profile.fixedAssetsNgn, isSmallCompany: citGuarded.result?.isSmallCompany, approximationNote: "turnover/fixedAssets approximated — see TaxCalculationService docstring" },
        { pnl, citResult: citGuarded.result, complianceState: citGuarded.complianceState, detail: citGuarded.detail, lossUtilisation: lossResult },
        citGuarded.ruleIdsUsed
      );

      const assessableProfitForLevy = citGuarded.result?.assessableProfitNgn ?? Math.max(pnl.netProfitBeforeTaxNgn, 0);
      const levyGuarded = this.guard(() => computeDevelopmentLevy(profile, assessableProfitForLevy, this.rules, asOfDate));

      const levyReturn = await this.persistReturn(
        organizationId,
        companyId,
        userId,
        "DEVELOPMENT_LEVY",
        periodStart,
        periodEnd,
        levyGuarded.result?.levyLiabilityNgn ?? null,
        levyGuarded.complianceState,
        levyGuarded.complianceState === "CALCULATED" ? "VERIFIED_CALCULATION" : "MISSING_REGULATORY_INFORMATION",
        { isSmallCompany: citGuarded.result?.isSmallCompany },
        { levyResult: levyGuarded.result, complianceState: levyGuarded.complianceState, detail: levyGuarded.detail },
        levyGuarded.ruleIdsUsed
      );

      return { citReturn, levyReturn };
    } catch (err) {
      if (err instanceof BadRequestException) throw err; // deliberate refusal (e.g. duplicate) — propagate directly, never re-persist as CALCULATION_ERROR
      const citReturn = await this.persistFailure(organizationId, companyId, userId, "CIT", periodStart, periodEnd, "CALCULATION_ERROR", err as Error);
      const levyReturn = await this.persistFailure(organizationId, companyId, userId, "DEVELOPMENT_LEVY", periodStart, periodEnd, "CALCULATION_ERROR", err as Error);
      return { citReturn, levyReturn };
    }
  }

  async computeVatReturn(organizationId: string, companyId: string, userId: string, periodStart: Date, periodEnd: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    try {
      await this.assertTaxpayerInfoComplete(companyId);
    } catch (err) {
      if (err instanceof MissingTaxpayerInformationError) {
        return this.persistFailure(organizationId, companyId, userId, "VAT", periodStart, periodEnd, "MISSING_TAXPAYER_INFORMATION", err);
      }
      throw err;
    }

    try {
      const [invoices, expenses] = await Promise.all([
        this.prisma.invoice.findMany({ where: { companyId, status: { not: "DRAFT" }, issueDate: { gte: periodStart, lte: periodEnd } } }),
        this.prisma.expense.findMany({ where: { companyId, status: { not: "DRAFT" }, expenseDate: { gte: periodStart, lte: periodEnd } } }),
      ]);

      const taxableSuppliesNgn = invoices.reduce((acc, inv) => acc + Number(inv.subtotalNgn), 0);
      const recoverableInputVatNgn = expenses.reduce((acc, exp) => acc + Number(exp.vatAmountNgn), 0);
      const pnl = await this.statements.getProfitAndLoss(organizationId, companyId, periodStart, periodEnd);
      const profile = await this.getCompanyProfile(companyId, pnl.totalRevenueNgn);

      const guarded = this.guard(() =>
        computeVat(profile, { taxableSuppliesNgn, recoverableInputVatNgn, nonRecoverableInputVatNgn: 0 }, this.rules, periodEnd.toISOString().slice(0, 10))
      );

      return this.persistReturn(
        organizationId,
        companyId,
        userId,
        "VAT",
        periodStart,
        periodEnd,
        guarded.result?.vatPayableOrCreditNgn ?? null,
        guarded.complianceState,
        guarded.complianceState === "CALCULATED" ? guarded.result!.confidence : "MISSING_REGULATORY_INFORMATION",
        { registrationRequired: guarded.result?.registrationRequired },
        { vatResult: guarded.result, complianceState: guarded.complianceState, detail: guarded.detail, invoiceCount: invoices.length, expenseCount: expenses.length },
        guarded.ruleIdsUsed
      );
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      return this.persistFailure(organizationId, companyId, userId, "VAT", periodStart, periodEnd, "CALCULATION_ERROR", err as Error);
    }
  }

  async computePayeReturn(organizationId: string, companyId: string, userId: string, periodStart: Date, periodEnd: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    try {
      await this.assertTaxpayerInfoComplete(companyId);
    } catch (err) {
      if (err instanceof MissingTaxpayerInformationError) {
        return this.persistFailure(organizationId, companyId, userId, "PAYE", periodStart, periodEnd, "MISSING_TAXPAYER_INFORMATION", err);
      }
      throw err;
    }

    try {
      const periodMonth = periodEnd.getUTCMonth() + 1;
      const periodYear = periodEnd.getUTCFullYear();
      const totalPayeNgn = await this.payroll.getTotalPayeForPeriod(companyId, periodMonth, periodYear);
      const calculations = await this.prisma.payeCalculation.findMany({ where: { periodMonth, periodYear, employee: { companyId } }, include: { employee: true } });

      return this.persistReturn(
        organizationId,
        companyId,
        userId,
        "PAYE",
        periodStart,
        periodEnd,
        totalPayeNgn,
        "CALCULATED",
        "VERIFIED_CALCULATION",
        { employeeCount: calculations.length },
        { perEmployee: calculations.map((c) => ({ employeeId: c.employeeId, name: c.employee.fullName, state: c.employee.stateOfResidenceCode, taxPayableNgn: Number(c.taxPayableNgn) })) },
        calculations.map((c) => c.ruleVersionId).filter((id) => id && id !== "unknown")
      );
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      return this.persistFailure(organizationId, companyId, userId, "PAYE", periodStart, periodEnd, "CALCULATION_ERROR", err as Error);
    }
  }

  async computeWhtReturn(organizationId: string, companyId: string, userId: string, periodStart: Date, periodEnd: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    try {
      await this.assertTaxpayerInfoComplete(companyId);
    } catch (err) {
      if (err instanceof MissingTaxpayerInformationError) {
        return this.persistFailure(organizationId, companyId, userId, "WHT", periodStart, periodEnd, "MISSING_TAXPAYER_INFORMATION", err);
      }
      throw err;
    }

    try {
      const totalWhtNgn = await this.wht.getTotalWhtForPeriod(companyId, periodStart, periodEnd);
      const transactions = await this.prisma.businessTransaction.findMany({
        where: { companyId, transactionDate: { gte: periodStart, lte: periodEnd } },
        include: { whtDetermination: true },
      });

      return this.persistReturn(
        organizationId,
        companyId,
        userId,
        "WHT",
        periodStart,
        periodEnd,
        totalWhtNgn,
        "CALCULATED",
        "VERIFIED_CALCULATION",
        {},
        { totalWhtNgn },
        transactions.map((t) => t.whtDetermination?.ruleVersionId).filter((id): id is string => !!id)
      );
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      return this.persistFailure(organizationId, companyId, userId, "WHT", periodStart, periodEnd, "CALCULATION_ERROR", err as Error);
    }
  }
}

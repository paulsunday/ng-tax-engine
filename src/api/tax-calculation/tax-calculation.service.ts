import { Inject, Injectable } from "@nestjs/common";
import { TaxType } from "@prisma/client";
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
import { CompanyProfile, UnverifiedRuleError, NoApplicableRuleError, ConfidenceLevel } from "../../types/common";
import { computeCit } from "../../engine/cit";
import { computeDevelopmentLevy } from "../../engine/developmentLevy";
import { computeVat } from "../../engine/vat";

const CALCULATION_VERSION = "tax-calculation-service-1.0";

/**
 * Orchestrates the framework-agnostic tax engine (src/engine/*, built independently —
 * see REGULATORY_RESEARCH_REPORT.md) against this app's real accounting data, producing
 * DRAFT TaxReturn rows. This is the first point where the tax engine touches a live
 * company's actual ledger rather than caller-supplied numbers.
 *
 * Known approximations (documented rather than hidden, per brief §34):
 *  - turnoverNgn for small-company classification uses this period's P&L revenue, not a
 *    verified annual turnover figure.
 *  - fixedAssetsNgn uses the sum of the CapitalAsset (tax) register's qualifying
 *    expenditure, not an independently audited fixed-asset value.
 *  - nonDeductibleExpensesNgn/nonTaxableIncomeNgn are not yet derived from actual expense
 *    categorization — they default to 0 pending a tax-adjustment-tagging feature.
 * Every TaxReturn carries a `status` of COMPUTED or PENDING_RULE_APPROVAL/NO_RULE_FOR_PERIOD
 * inside its calculationBreakdown so this is never silently glossed over.
 */
@Injectable()
export class TaxCalculationService {
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

  private guard<T>(fn: () => T): { status: "COMPUTED" | "PENDING_RULE_APPROVAL" | "NO_RULE_FOR_PERIOD"; result: T | null; detail?: string } {
    try {
      return { status: "COMPUTED", result: fn() };
    } catch (err) {
      if (err instanceof UnverifiedRuleError) return { status: "PENDING_RULE_APPROVAL", result: null, detail: err.message };
      if (err instanceof NoApplicableRuleError) return { status: "NO_RULE_FOR_PERIOD", result: null, detail: err.message };
      throw err;
    }
  }

  private async persistReturn(
    organizationId: string,
    companyId: string,
    userId: string,
    taxType: TaxType,
    periodStart: Date,
    periodEnd: Date,
    taxLiabilityNgn: number,
    confidence: ConfidenceLevel,
    classificationSnapshot: Record<string, unknown>,
    breakdown: Record<string, unknown>
  ) {
    const existing = await this.prisma.taxReturn.findFirst({ where: { companyId, taxType, periodStart, periodEnd } });
    if (existing) {
      throw new Error(`A ${taxType} return for this period already exists (id ${existing.id}) — supersede it explicitly rather than creating a duplicate.`);
    }

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
        confidence,
        status: "DRAFT",
      },
    });

    await this.auditLog.record({
      organizationId,
      userId,
      action: "COMPUTE",
      objectType: "TaxReturn",
      objectId: taxReturn.id,
      newValue: { taxType, taxLiabilityNgn, confidence },
    });

    return taxReturn;
  }

  async computeCitAndDevelopmentLevy(organizationId: string, companyId: string, userId: string, periodStart: Date, periodEnd: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
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
      citGuarded.result?.taxLiabilityNgn ?? 0,
      citGuarded.status === "COMPUTED" ? "VERIFIED_CALCULATION" : "MISSING_REGULATORY_INFORMATION",
      { turnoverNgn: profile.turnoverNgn, fixedAssetsNgn: profile.fixedAssetsNgn, isSmallCompany: citGuarded.result?.isSmallCompany, approximationNote: "turnover/fixedAssets approximated — see TaxCalculationService docstring" },
      { pnl, citResult: citGuarded.result, status: citGuarded.status, detail: citGuarded.detail, lossUtilisation: lossResult }
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
      levyGuarded.result?.levyLiabilityNgn ?? 0,
      levyGuarded.status === "COMPUTED" ? "VERIFIED_CALCULATION" : "MISSING_REGULATORY_INFORMATION",
      { isSmallCompany: citGuarded.result?.isSmallCompany },
      { levyResult: levyGuarded.result, status: levyGuarded.status, detail: levyGuarded.detail }
    );

    return { citReturn, levyReturn };
  }

  async computeVatReturn(organizationId: string, companyId: string, userId: string, periodStart: Date, periodEnd: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
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
      guarded.result?.vatPayableOrCreditNgn ?? 0,
      guarded.status === "COMPUTED" ? guarded.result!.confidence : "MISSING_REGULATORY_INFORMATION",
      { registrationRequired: guarded.result?.registrationRequired },
      { vatResult: guarded.result, status: guarded.status, detail: guarded.detail, invoiceCount: invoices.length, expenseCount: expenses.length }
    );
  }

  async computePayeReturn(organizationId: string, companyId: string, userId: string, periodStart: Date, periodEnd: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
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
      "VERIFIED_CALCULATION",
      { employeeCount: calculations.length },
      { perEmployee: calculations.map((c) => ({ employeeId: c.employeeId, name: c.employee.fullName, state: c.employee.stateOfResidenceCode, taxPayableNgn: Number(c.taxPayableNgn) })) }
    );
  }

  async computeWhtReturn(organizationId: string, companyId: string, userId: string, periodStart: Date, periodEnd: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const totalWhtNgn = await this.wht.getTotalWhtForPeriod(companyId, periodStart, periodEnd);

    return this.persistReturn(organizationId, companyId, userId, "WHT", periodStart, periodEnd, totalWhtNgn, "VERIFIED_CALCULATION", {}, { totalWhtNgn });
  }
}

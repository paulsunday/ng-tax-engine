import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { TaxType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { RULE_REPOSITORY } from "../tax-rules/tax-rules.constants";
import { RuleRepository } from "../../rules/RuleRepository";
import { UnverifiedRuleError, NoApplicableRuleError } from "../../types/common";
import { computeStatutoryDeadline, buildComplianceCalendarEntry } from "../../engine/deadlines";

/**
 * Maps each tax type to the rule key (and, where the rule has multiple shapes, the path
 * selector) that governs its filing deadline — never a hardcoded date rule in this file
 * itself (brief §16: "Do not hardcode: All taxes are due on the 21st."). WHT has no entry
 * here on purpose: research report §8 item 2 found the governing rule itself conflicted
 * and unresolved (status REQUIRES_REVIEW) — computing a WHT deadline today correctly
 * throws rather than guessing.
 */
const DEADLINE_RULE_MAP: Partial<Record<TaxType, { ruleKey: string; jurisdiction: string; pathSelector?: string }>> = {
  VAT: { ruleKey: "vat_filing_deadline_rule", jurisdiction: "NG-FEDERAL" },
  CIT: { ruleKey: "cit_filing_deadline_rule", jurisdiction: "NG-FEDERAL", pathSelector: "established_company" },
  DEVELOPMENT_LEVY: { ruleKey: "cit_filing_deadline_rule", jurisdiction: "NG-FEDERAL", pathSelector: "established_company" },
  PAYE: { ruleKey: "paye_annual_employer_return_deadline", jurisdiction: "NG-STATE" },
};

@Injectable()
export class ComplianceCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly auditLog: AuditLogService,
    @Inject(RULE_REPOSITORY) private readonly rules: RuleRepository
  ) {}

  /**
   * Computes the statutory deadline and builds a calendar entry linked to a TaxReturn.
   * internalSafetyMarginDays is administrator-configurable (brief §17's worked example:
   * statutory 21st -> internal 19th -> recommended filing 18th) — never assumed to be a
   * fixed "2 days before the 21st" in code.
   */
  async createForReturn(organizationId: string, companyId: string, userId: string, taxReturnId: string, internalSafetyMarginDays: number, responsiblePerson?: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const taxReturn = await this.prisma.taxReturn.findUnique({ where: { id: taxReturnId } });
    if (!taxReturn || taxReturn.companyId !== companyId) throw new NotFoundException("Tax return not found.");

    const mapping = DEADLINE_RULE_MAP[taxReturn.taxType];
    if (!mapping) {
      throw new BadRequestException(`No deadline rule mapping exists yet for tax type "${taxReturn.taxType}" — see research report for the unresolved rule status.`);
    }

    const asOfDate = taxReturn.periodEnd.toISOString().slice(0, 10);
    let statutoryDeadline: string;
    let explanation: string;
    try {
      const deadlineResult = computeStatutoryDeadline(
        { taxType: taxReturn.taxType, ruleKey: mapping.ruleKey, jurisdiction: mapping.jurisdiction, periodEnd: taxReturn.periodEnd.toISOString().slice(0, 10), pathSelector: mapping.pathSelector as any },
        this.rules,
        asOfDate
      );
      statutoryDeadline = deadlineResult.statutoryDeadline;
      explanation = deadlineResult.explanation;
    } catch (err) {
      if (err instanceof UnverifiedRuleError || err instanceof NoApplicableRuleError) {
        throw new BadRequestException(`Cannot compute the statutory deadline: ${err.message}`);
      }
      throw err;
    }

    const calendarResult = buildComplianceCalendarEntry({
      taxType: taxReturn.taxType,
      periodLabel: `${taxReturn.periodStart.toISOString().slice(0, 10)} to ${taxReturn.periodEnd.toISOString().slice(0, 10)}`,
      statutoryDeadline,
      internalSafetyMarginDays,
      // Never coerce a null (not-yet-CALCULATED) liability into a literal 0 — that would
      // claim "nothing owed" when the true state is "not calculated yet" (mandate §2).
      amountNgn: taxReturn.complianceState === "CALCULATED" && taxReturn.taxLiabilityNgn !== null ? Number(taxReturn.taxLiabilityNgn) : undefined,
      asOfDate: new Date().toISOString().slice(0, 10),
    });

    const entry = await this.prisma.complianceCalendarEntry.create({
      data: {
        companyId,
        taxReturnId,
        taxType: taxReturn.taxType,
        periodLabel: calendarResult.periodLabel,
        statutoryDeadline: new Date(calendarResult.statutoryDeadline),
        internalDeadline: new Date(calendarResult.internalDeadline),
        recommendedFilingDate: new Date(calendarResult.recommendedFilingDate),
        amountNgn: calendarResult.amountNgn,
        responsiblePerson,
        isOverdue: calendarResult.isOverdue,
      },
    });

    await this.auditLog.record({
      organizationId,
      userId,
      action: "CREATE",
      objectType: "ComplianceCalendarEntry",
      objectId: entry.id,
      newValue: { statutoryDeadline: calendarResult.statutoryDeadline, explanation },
    });

    return entry;
  }

  async listForCompany(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.complianceCalendarEntry.findMany({ where: { companyId }, orderBy: { statutoryDeadline: "asc" } });
  }

  /** Recomputes isOverdue/daysRemaining for every open entry — meant to be run on a schedule (brief §50). */
  async refreshOverdueStatus(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const entries = await this.prisma.complianceCalendarEntry.findMany({ where: { companyId, filingStatus: { not: "FILED" } } });
    const now = new Date();

    const updates = entries.map((e) => this.prisma.complianceCalendarEntry.update({ where: { id: e.id }, data: { isOverdue: e.statutoryDeadline < now } }));
    await this.prisma.$transaction(updates);
    return { checked: entries.length };
  }
}

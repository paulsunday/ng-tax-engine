import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { RULE_REPOSITORY } from "../tax-rules/tax-rules.constants";
import { RuleRepository } from "../../rules/RuleRepository";
import { computePaye } from "../../engine/paye";
import { UnverifiedRuleError, NoApplicableRuleError } from "../../types/common";

export interface CreateEmployeeInput {
  fullName: string;
  stateOfResidenceCode: string;
  stateOfWorkCode: string;
  isResident?: boolean;
  tin?: string;
  branchId?: string;
}

export interface RunPayeInput {
  periodMonth: number;
  periodYear: number;
  grossEmolumentNgn: number;
  annualRentNgn?: number;
  isMinimumWageEarner?: boolean;
}

/**
 * PAYE engine (src/engine/paye.ts) wired to real Employee records. There is no payroll-
 * run/salary-structure module yet (brief's broader "Payroll" feature set) — gross
 * emolument for the period is supplied directly per employee per period. Jurisdiction is
 * the employee's OWN stateOfResidenceCode, never the company's head-office state (brief
 * §16), exactly as already enforced by the jurisdiction engine built earlier.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    @Inject(RULE_REPOSITORY) private readonly rules: RuleRepository
  ) {}

  async createEmployee(organizationId: string, companyId: string, input: CreateEmployeeInput) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.employee.create({
      data: {
        companyId,
        fullName: input.fullName,
        stateOfResidenceCode: input.stateOfResidenceCode,
        stateOfWorkCode: input.stateOfWorkCode,
        isResident: input.isResident ?? true,
        tin: input.tin,
        branchId: input.branchId,
      },
    });
  }

  async listEmployees(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.employee.findMany({ where: { companyId } });
  }

  async runPayeForEmployee(organizationId: string, companyId: string, employeeId: string, input: RunPayeInput, asOfDate: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.companyId !== companyId) throw new NotFoundException("Employee not found.");

    let result: ReturnType<typeof computePaye>;
    try {
      result = computePaye(
        {
          employeeId: employee.id,
          stateOfResidence: employee.stateOfResidenceCode,
          annualGrossEmolumentNgn: input.grossEmolumentNgn,
          annualRentPaidNgn: input.annualRentNgn ?? 0,
          isMinimumWageEarner: input.isMinimumWageEarner ?? false,
        },
        this.rules,
        asOfDate.toISOString().slice(0, 10)
      );
    } catch (err) {
      // Never let an unapproved/missing rule surface as an opaque 500 — a clear, caught
      // compliance message instead (mandate §2).
      if (err instanceof UnverifiedRuleError || err instanceof NoApplicableRuleError) {
        throw new BadRequestException(`Cannot compute PAYE for this employee: ${err.message}`);
      }
      throw err;
    }

    const calculation = await this.prisma.payeCalculation.create({
      data: {
        employeeId: employee.id,
        periodMonth: input.periodMonth,
        periodYear: input.periodYear,
        grossEmolumentNgn: input.grossEmolumentNgn,
        annualRentNgn: input.annualRentNgn,
        reliefAppliedNgn: result.rentReliefNgn,
        taxableIncomeNgn: result.taxableIncomeNgn,
        taxPayableNgn: result.annualTaxNgn,
        ruleVersionId: result.ruleIdsUsed[0] ?? "unknown",
        breakdown: { bandBreakdown: result.bandBreakdown, explanation: result.explanation } as any,
        confidence: result.confidence,
      },
    });

    return { calculation, relevantTaxAuthority: result.relevantTaxAuthority, explanation: result.explanation };
  }

  /** Sums PAYE liability across all employees for a given period — the basis of a monthly PAYE return. */
  async getTotalPayeForPeriod(companyId: string, periodMonth: number, periodYear: number): Promise<number> {
    const calculations = await this.prisma.payeCalculation.findMany({
      where: { periodMonth, periodYear, employee: { companyId } },
    });
    return calculations.reduce((acc, c) => acc + Number(c.taxPayableNgn), 0);
  }
}

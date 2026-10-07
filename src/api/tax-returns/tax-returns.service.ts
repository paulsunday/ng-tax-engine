import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { AuditLogService } from "../audit-log/audit-log.service";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Filing validation + approval workflow (brief §27-28). "If a critical validation fails:
 * DO NOT FILE" is enforced structurally — validate() never flips status to VALIDATED when
 * errors exist, and FilingService (separate module) refuses to submit anything that isn't
 * APPROVED, so there is no code path that skips this gate.
 */
@Injectable()
export class TaxReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly auditLog: AuditLogService
  ) {}

  async getOneOrThrow(organizationId: string, companyId: string, taxReturnId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const taxReturn = await this.prisma.taxReturn.findUnique({ where: { id: taxReturnId }, include: { payments: true, filingAttempts: true, complianceEntry: true } });
    if (!taxReturn || taxReturn.companyId !== companyId) throw new NotFoundException("Tax return not found.");
    return taxReturn;
  }

  async listForCompany(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.taxReturn.findMany({ where: { companyId }, orderBy: { periodStart: "desc" } });
  }

  async validate(organizationId: string, companyId: string, userId: string, taxReturnId: string): Promise<ValidationResult> {
    const taxReturn = await this.getOneOrThrow(organizationId, companyId, taxReturnId);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });

    const errors: string[] = [];
    if (!company.tin) errors.push("Company has no TIN on record.");
    if (taxReturn.periodEnd <= taxReturn.periodStart) errors.push("Period end must be after period start.");
    if (taxReturn.confidence === "MISSING_REGULATORY_INFORMATION" || taxReturn.confidence === "REQUIRES_REVIEW") {
      errors.push(`Calculation confidence is "${taxReturn.confidence}" — the governing tax rule has not been professionally approved yet. Cannot file on an unverified calculation.`);
    }
    if (taxReturn.complianceState !== "CALCULATED" || taxReturn.taxLiabilityNgn === null) {
      errors.push(`Compliance state is "${taxReturn.complianceState}" — there is no calculated liability to validate. Cannot file on an incomplete calculation.`);
    }
    if (taxReturn.status !== "DRAFT") errors.push(`Return status is "${taxReturn.status}" — only a DRAFT return can be (re-)validated.`);
    if (taxReturn.taxLiabilityNgn !== null && Number(taxReturn.taxLiabilityNgn) < 0) errors.push("Tax liability cannot be negative.");

    const valid = errors.length === 0;
    if (valid) {
      await this.prisma.taxReturn.update({ where: { id: taxReturnId }, data: { status: "VALIDATED" } });
    }

    await this.auditLog.record({
      organizationId,
      userId,
      action: "VALIDATE",
      objectType: "TaxReturn",
      objectId: taxReturnId,
      newValue: { valid, errors },
    });

    return { valid, errors };
  }

  async approve(organizationId: string, companyId: string, userId: string, taxReturnId: string) {
    const taxReturn = await this.getOneOrThrow(organizationId, companyId, taxReturnId);
    if (taxReturn.status !== "VALIDATED") {
      throw new BadRequestException(`Cannot approve a return with status "${taxReturn.status}" — it must be VALIDATED first.`);
    }

    const updated = await this.prisma.taxReturn.update({
      where: { id: taxReturnId },
      data: { status: "APPROVED", approvedAt: new Date(), approvedBy: userId },
    });

    await this.auditLog.record({ organizationId, userId, action: "APPROVE", objectType: "TaxReturn", objectId: taxReturnId });
    return updated;
  }

  async reject(organizationId: string, companyId: string, userId: string, taxReturnId: string, reason: string) {
    const taxReturn = await this.getOneOrThrow(organizationId, companyId, taxReturnId);
    if (!["DRAFT", "VALIDATED"].includes(taxReturn.status)) {
      throw new BadRequestException(`Cannot reject a return with status "${taxReturn.status}".`);
    }

    const updated = await this.prisma.taxReturn.update({ where: { id: taxReturnId }, data: { status: "REJECTED", rejectionReason: reason } });
    await this.auditLog.record({ organizationId, userId, action: "REJECT", objectType: "TaxReturn", objectId: taxReturnId, reason });
    return updated;
  }
}

import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { ADAPTER_REGISTRY } from "./filing.constants";
import { AdapterRegistry } from "../../adapters/AdapterRegistry";

export type FilingMode = "MANUAL" | "APPROVAL_REQUIRED" | "AUTOMATIC";

/**
 * Wires the existing TaxAuthorityAdapter/AdapterRegistry (built earlier, see
 * research/REGULATORY_RESEARCH_REPORT.md §8 item 9 — no confirmed official e-filing API
 * exists for any authority researched so far) to real TaxReturn rows.
 *
 * Simplification: PAYE is routed to the company's headOfficeStateCode's adapter. A real
 * multi-state PAYE return should be split per employee-residence state (the jurisdiction
 * engine already warns about exactly this) — tracked as a follow-up, not silently ignored.
 */
@Injectable()
export class FilingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly auditLog: AuditLogService,
    @Inject(ADAPTER_REGISTRY) private readonly adapters: AdapterRegistry
  ) {}

  async submit(organizationId: string, companyId: string, userId: string, taxReturnId: string, mode: FilingMode) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const [taxReturn, company] = await Promise.all([
      this.prisma.taxReturn.findUnique({ where: { id: taxReturnId } }),
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    ]);
    if (!taxReturn || taxReturn.companyId !== companyId) throw new NotFoundException("Tax return not found.");

    if (taxReturn.status !== "APPROVED") {
      throw new BadRequestException(`Cannot submit a return with status "${taxReturn.status}" — it must be APPROVED first (brief §27-28).`);
    }
    if (taxReturn.submittedAt) {
      throw new BadRequestException("This return has already been submitted — refusing to file a duplicate (brief §51).");
    }
    if (!company.tin) {
      throw new BadRequestException("Company has no TIN — cannot submit to any tax authority.");
    }

    const authorityKey = taxReturn.taxType === "PAYE" ? company.headOfficeStateCode : "FEDERAL";
    const adapter = this.adapters.get(authorityKey);

    const payload = {
      taxReturnId: taxReturn.id,
      taxType: taxReturn.taxType,
      periodStart: taxReturn.periodStart.toISOString().slice(0, 10),
      periodEnd: taxReturn.periodEnd.toISOString().slice(0, 10),
      taxpayerTin: company.tin,
      calculationBreakdown: taxReturn.calculationBreakdown as Record<string, unknown>,
      taxLiabilityNgn: Number(taxReturn.taxLiabilityNgn),
    };

    const validation = await adapter.validateReturn(payload);
    if (!validation.valid) {
      await this.prisma.filingAttempt.create({
        data: { taxReturnId, mode, authorityAdapter: adapter.authorityName, succeeded: false, errorClass: "VALIDATION", rawResponse: { errors: validation.errors } as any },
      });
      return { succeeded: false, errors: validation.errors };
    }

    const result = await adapter.submitReturn(payload);

    const attempt = await this.prisma.filingAttempt.create({
      data: {
        taxReturnId,
        mode,
        authorityAdapter: adapter.authorityName,
        succeeded: result.succeeded,
        errorClass: result.errorClass,
        rawResponse: result.rawResponse as any,
        receiptReference: result.submissionReference,
      },
    });

    if (result.succeeded) {
      await this.prisma.taxReturn.update({
        where: { id: taxReturnId },
        data: { status: "FILED", submittedAt: new Date(), submissionReference: result.submissionReference },
      });
    }
    // brief §29: if filing fails, do NOT mark as filed. Status deliberately stays APPROVED.

    await this.auditLog.record({
      organizationId,
      userId,
      action: "SUBMIT_FILING",
      objectType: "TaxReturn",
      objectId: taxReturnId,
      newValue: { succeeded: result.succeeded, authority: adapter.authorityName, mode },
    });

    return { succeeded: result.succeeded, filingAttempt: attempt, filingPackage: result.rawResponse };
  }

  async recordManualReceipt(organizationId: string, companyId: string, userId: string, taxReturnId: string, receiptReference: string, submissionReference: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const taxReturn = await this.prisma.taxReturn.findUnique({ where: { id: taxReturnId } });
    if (!taxReturn || taxReturn.companyId !== companyId) throw new NotFoundException("Tax return not found.");
    if (taxReturn.status !== "APPROVED") {
      throw new BadRequestException(`Cannot record a manual filing receipt for a return with status "${taxReturn.status}".`);
    }

    const updated = await this.prisma.taxReturn.update({
      where: { id: taxReturnId },
      data: { status: "FILED", submittedAt: new Date(), submissionReference, receiptReference },
    });

    await this.auditLog.record({ organizationId, userId, action: "RECORD_MANUAL_RECEIPT", objectType: "TaxReturn", objectId: taxReturnId, newValue: { receiptReference } });
    return updated;
  }

  async listAttempts(organizationId: string, companyId: string, taxReturnId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const taxReturn = await this.prisma.taxReturn.findUnique({ where: { id: taxReturnId } });
    if (!taxReturn || taxReturn.companyId !== companyId) throw new NotFoundException("Tax return not found.");
    return this.prisma.filingAttempt.findMany({ where: { taxReturnId }, orderBy: { attemptedAt: "desc" } });
  }
}

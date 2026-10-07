import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { AuditLogService } from "../audit-log/audit-log.service";

/**
 * Tax payment tracking, deliberately independent of filing status (brief §20: "The
 * system should never mark a tax obligation as paid merely because a return was filed.").
 * A return can be FILED with payments still PENDING, or (less commonly) paid before
 * filing — these are tracked as separate facts throughout.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly auditLog: AuditLogService
  ) {}

  async recordPayment(organizationId: string, companyId: string, userId: string, taxReturnId: string, amountNgn: number, paymentReference?: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const taxReturn = await this.prisma.taxReturn.findUnique({ where: { id: taxReturnId } });
    if (!taxReturn || taxReturn.companyId !== companyId) throw new NotFoundException("Tax return not found.");

    const payment = await this.prisma.payment.create({
      data: { taxReturnId, amountNgn, paymentReference, status: "PENDING" },
    });

    await this.auditLog.record({ organizationId, userId, action: "RECORD_PAYMENT", objectType: "Payment", objectId: payment.id, newValue: { amountNgn, paymentReference } });
    return payment;
  }

  async confirmPayment(organizationId: string, companyId: string, userId: string, paymentId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { taxReturn: true } });
    if (!payment || payment.taxReturn.companyId !== companyId) throw new NotFoundException("Payment not found.");

    const updated = await this.prisma.payment.update({ where: { id: paymentId }, data: { status: "CONFIRMED", paidAt: new Date() } });
    await this.auditLog.record({ organizationId, userId, action: "CONFIRM_PAYMENT", objectType: "Payment", objectId: paymentId });
    return updated;
  }

  async getOutstandingBalance(
    organizationId: string,
    companyId: string,
    taxReturnId: string
  ): Promise<{ taxLiabilityNgn: number | null; confirmedPaidNgn: number; outstandingNgn: number | null; complianceState: string }> {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const taxReturn = await this.prisma.taxReturn.findUnique({ where: { id: taxReturnId }, include: { payments: true } });
    if (!taxReturn || taxReturn.companyId !== companyId) throw new NotFoundException("Tax return not found.");

    const confirmedPaidNgn = taxReturn.payments.filter((p) => p.status === "CONFIRMED").reduce((acc, p) => acc + Number(p.amountNgn), 0);
    // Never fabricate an outstanding balance against a liability we don't actually have —
    // Number(null) would silently become 0, implying "nothing owed," which is a materially
    // different (and false) claim from "we haven't calculated this yet" (mandate §2).
    if (taxReturn.complianceState !== "CALCULATED" || taxReturn.taxLiabilityNgn === null) {
      return { taxLiabilityNgn: null, confirmedPaidNgn, outstandingNgn: null, complianceState: taxReturn.complianceState };
    }

    const taxLiabilityNgn = Number(taxReturn.taxLiabilityNgn);
    return { taxLiabilityNgn, confirmedPaidNgn, outstandingNgn: round2(taxLiabilityNgn - confirmedPaidNgn), complianceState: taxReturn.complianceState };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

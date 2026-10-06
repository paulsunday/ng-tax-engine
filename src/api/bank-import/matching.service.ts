import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { AuditLogService } from "../audit-log/audit-log.service";

const DATE_WINDOW_DAYS = 3;
const AMOUNT_TOLERANCE_NGN = 0.01;

export interface MatchCandidate {
  entityType: "AccountingPayment";
  entityId: string;
  amountNgn: number;
  date: Date;
  confidence: "EXACT" | "LIKELY";
}

/**
 * Matches bank transactions against AccountingPayment records (brief §7's "match bank
 * transactions against ... customer payments, supplier payments"). Scope note: this
 * Phase-3 pass matches against AccountingPayment only — the highest-value, most common
 * source of bank movement in this system's current data model. Matching against raw
 * manual JournalEntry postings, payroll, and loan transactions is a documented follow-up,
 * not silently claimed as covered.
 */
@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly auditLog: AuditLogService
  ) {}

  private async findCandidates(companyId: string, bankTransaction: { creditNgn: any; debitNgn: any; transactionDate: Date }): Promise<MatchCandidate[]> {
    const direction = Number(bankTransaction.creditNgn) > 0 ? "RECEIPT" : "DISBURSEMENT";
    const amount = Number(bankTransaction.creditNgn) > 0 ? Number(bankTransaction.creditNgn) : Number(bankTransaction.debitNgn);

    const windowStart = new Date(bankTransaction.transactionDate);
    windowStart.setDate(windowStart.getDate() - DATE_WINDOW_DAYS);
    const windowEnd = new Date(bankTransaction.transactionDate);
    windowEnd.setDate(windowEnd.getDate() + DATE_WINDOW_DAYS);

    const alreadyMatchedPaymentIds = (
      await this.prisma.bankTransaction.findMany({
        where: { companyId, matchStatus: "MATCHED", matchedEntityType: "AccountingPayment" },
        select: { matchedEntityId: true },
      })
    ).map((r) => r.matchedEntityId);

    const candidates = await this.prisma.accountingPayment.findMany({
      where: {
        companyId,
        direction,
        paymentDate: { gte: windowStart, lte: windowEnd },
        id: { notIn: alreadyMatchedPaymentIds.filter((id): id is string => !!id) },
      },
    });

    return candidates
      .map((c) => ({
        entityType: "AccountingPayment" as const,
        entityId: c.id,
        amountNgn: Number(c.amountNgn),
        date: c.paymentDate,
        confidence: (Math.abs(Number(c.amountNgn) - amount) <= AMOUNT_TOLERANCE_NGN ? "EXACT" : "LIKELY") as "EXACT" | "LIKELY",
      }))
      .filter((c) => Math.abs(c.amountNgn - amount) <= amount * 0.02 + 1) // within 2% + 1 naira — otherwise not a plausible candidate at all
      .sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === "EXACT" ? -1 : 1));
  }

  /**
   * Runs matching for one transaction. An EXACT candidate is auto-applied (matchStatus
   * MATCHED). A LIKELY candidate is surfaced but NOT auto-applied — brief §7 asks the
   * system to "show unmatched transactions", and a fuzzy guess auto-confirmed as fact
   * would defeat that review step.
   */
  async matchTransaction(organizationId: string, companyId: string, bankTransactionId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const transaction = await this.prisma.bankTransaction.findUnique({ where: { id: bankTransactionId } });
    if (!transaction || transaction.companyId !== companyId) throw new NotFoundException("Bank transaction not found.");

    const candidates = await this.findCandidates(companyId, transaction);
    const exact = candidates.find((c) => c.confidence === "EXACT");

    if (exact) {
      const updated = await this.prisma.bankTransaction.update({
        where: { id: bankTransactionId },
        data: { matchStatus: "MATCHED", matchedEntityType: exact.entityType, matchedEntityId: exact.entityId, matchConfidence: "EXACT" },
      });
      return { transaction: updated, candidates, autoMatched: true };
    }

    return { transaction, candidates, autoMatched: false };
  }

  async autoMatchAllUnmatched(organizationId: string, companyId: string, bankAccountId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const unmatched = await this.prisma.bankTransaction.findMany({ where: { companyId, bankAccountId, matchStatus: "UNMATCHED" } });

    let autoMatchedCount = 0;
    const results = [];
    for (const txn of unmatched) {
      const result = await this.matchTransaction(organizationId, companyId, txn.id);
      if (result.autoMatched) autoMatchedCount++;
      results.push(result);
    }
    return { totalChecked: unmatched.length, autoMatchedCount, results };
  }

  async confirmMatch(organizationId: string, companyId: string, userId: string, bankTransactionId: string, entityType: string, entityId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const transaction = await this.prisma.bankTransaction.findUnique({ where: { id: bankTransactionId } });
    if (!transaction || transaction.companyId !== companyId) throw new NotFoundException("Bank transaction not found.");

    const updated = await this.prisma.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { matchStatus: "MATCHED", matchedEntityType: entityType, matchedEntityId: entityId, matchConfidence: "MANUAL" },
    });

    await this.auditLog.record({
      organizationId,
      userId,
      action: "MANUAL_MATCH",
      objectType: "BankTransaction",
      objectId: bankTransactionId,
      newValue: { matchedEntityType: entityType, matchedEntityId: entityId },
    });

    return updated;
  }

  async unmatch(organizationId: string, companyId: string, userId: string, bankTransactionId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const transaction = await this.prisma.bankTransaction.findUnique({ where: { id: bankTransactionId } });
    if (!transaction || transaction.companyId !== companyId) throw new NotFoundException("Bank transaction not found.");
    if (transaction.reconciliationId) {
      throw new BadRequestException("Cannot unmatch a transaction that is already part of a completed reconciliation.");
    }

    const updated = await this.prisma.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { matchStatus: "UNMATCHED", matchedEntityType: null, matchedEntityId: null, matchConfidence: null },
    });

    await this.auditLog.record({ organizationId, userId, action: "UNMATCH", objectType: "BankTransaction", objectId: bankTransactionId });
    return updated;
  }
}

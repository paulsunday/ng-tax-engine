import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { BankAccountsService } from "../bank-accounts/bank-accounts.service";
import { JournalService } from "../journal/journal.service";
import { AuditLogService } from "../audit-log/audit-log.service";

export interface StartReconciliationInput {
  bankAccountId: string;
  periodLabel: string;
  statementEndDate: Date;
  statementBalanceNgn: number;
}

/**
 * Bank reconciliation (brief §8). Scope note: "outstanding deposits/payments" are derived
 * from AccountingPayment rows that have no MATCHED bank transaction yet — this system's
 * Cash/Bank ledger movements all originate from AccountingPayment (Phase 2), so this is a
 * genuine, not approximated, definition for the data this app actually has. It does NOT
 * yet cross-reference raw manual JournalEntry postings to the bank's GL account, which is
 * the same documented limitation as MatchingService.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly bankAccounts: BankAccountsService,
    private readonly journal: JournalService,
    private readonly auditLog: AuditLogService
  ) {}

  async start(organizationId: string, companyId: string, userId: string, input: StartReconciliationInput) {
    const bankAccount = await this.bankAccounts.getOneOrThrow(organizationId, companyId, input.bankAccountId);
    if (!bankAccount.glAccountId) {
      throw new BadRequestException("This bank account has no linked chart-of-accounts GL account (glAccountId) — set one before reconciling.");
    }

    const trialBalance = await this.journal.getTrialBalance(organizationId, companyId, input.statementEndDate);
    const glRow = trialBalance.rows.find((r) => r.accountId === bankAccount.glAccountId);
    const ledgerBalanceNgn = glRow ? round2(glRow.debitNgn - glRow.creditNgn) : 0;

    const reconciliation = await this.prisma.reconciliation.create({
      data: {
        organizationId,
        companyId,
        bankAccountId: input.bankAccountId,
        periodLabel: input.periodLabel,
        statementEndDate: input.statementEndDate,
        statementBalanceNgn: input.statementBalanceNgn,
        ledgerBalanceNgn,
        status: "IN_PROGRESS",
      },
    });

    await this.auditLog.record({
      organizationId,
      userId,
      action: "CREATE",
      objectType: "Reconciliation",
      objectId: reconciliation.id,
      newValue: { statementBalanceNgn: input.statementBalanceNgn, ledgerBalanceNgn },
    });

    return this.getSummary(organizationId, companyId, reconciliation.id);
  }

  /**
   * The actual reconciliation view (brief §8): bank balance, ledger balance, outstanding
   * deposits/payments, unmatched bank transactions, duplicates, balance difference.
   */
  async getSummary(organizationId: string, companyId: string, reconciliationId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const reconciliation = await this.prisma.reconciliation.findUnique({ where: { id: reconciliationId } });
    if (!reconciliation || reconciliation.companyId !== companyId) throw new NotFoundException("Reconciliation not found.");

    const matchedPaymentIds = (
      await this.prisma.bankTransaction.findMany({
        where: { companyId, matchStatus: "MATCHED", matchedEntityType: "AccountingPayment" },
        select: { matchedEntityId: true },
      })
    )
      .map((r) => r.matchedEntityId)
      .filter((id): id is string => !!id);

    const [outstandingDeposits, outstandingPayments, unmatchedBankTransactions, duplicateGroups] = await Promise.all([
      this.prisma.accountingPayment.findMany({
        where: { companyId, direction: "RECEIPT", paymentDate: { lte: reconciliation.statementEndDate }, id: { notIn: matchedPaymentIds } },
      }),
      this.prisma.accountingPayment.findMany({
        where: { companyId, direction: "DISBURSEMENT", paymentDate: { lte: reconciliation.statementEndDate }, id: { notIn: matchedPaymentIds } },
      }),
      this.prisma.bankTransaction.findMany({
        where: { bankAccountId: reconciliation.bankAccountId, matchStatus: "UNMATCHED", transactionDate: { lte: reconciliation.statementEndDate } },
      }),
      this.prisma.bankTransaction.groupBy({
        by: ["dedupeHash"],
        where: { bankAccountId: reconciliation.bankAccountId },
        _count: { dedupeHash: true },
        having: { dedupeHash: { _count: { gt: 1 } } },
      }),
    ]);

    const outstandingDepositsTotal = round2(outstandingDeposits.reduce((acc, p) => acc + Number(p.amountNgn), 0));
    const outstandingPaymentsTotal = round2(outstandingPayments.reduce((acc, p) => acc + Number(p.amountNgn), 0));
    const balanceDifference = round2(Number(reconciliation.statementBalanceNgn) - Number(reconciliation.ledgerBalanceNgn));

    return {
      reconciliation,
      statementBalanceNgn: Number(reconciliation.statementBalanceNgn),
      ledgerBalanceNgn: Number(reconciliation.ledgerBalanceNgn),
      balanceDifference,
      outstandingDeposits,
      outstandingDepositsTotal,
      outstandingPayments,
      outstandingPaymentsTotal,
      unmatchedBankTransactions,
      duplicateTransactionGroupCount: duplicateGroups.length,
    };
  }

  async complete(organizationId: string, companyId: string, userId: string, reconciliationId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const reconciliation = await this.prisma.reconciliation.findUnique({ where: { id: reconciliationId } });
    if (!reconciliation || reconciliation.companyId !== companyId) throw new NotFoundException("Reconciliation not found.");
    if (reconciliation.status === "COMPLETED") throw new BadRequestException("This reconciliation is already completed.");

    const matchedTransactions = await this.prisma.bankTransaction.findMany({
      where: { bankAccountId: reconciliation.bankAccountId, matchStatus: "MATCHED", transactionDate: { lte: reconciliation.statementEndDate } },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.bankTransaction.updateMany({
        where: { id: { in: matchedTransactions.map((t) => t.id) } },
        data: { reconciliationId },
      });
      return tx.reconciliation.update({
        where: { id: reconciliationId },
        data: { status: "COMPLETED", completedBy: userId, completedAt: new Date() },
      });
    });

    await this.auditLog.record({
      organizationId,
      userId,
      action: "COMPLETE",
      objectType: "Reconciliation",
      objectId: reconciliationId,
      newValue: { reconciledTransactionCount: matchedTransactions.length },
    });

    return updated;
  }

  async listForBankAccount(organizationId: string, companyId: string, bankAccountId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.reconciliation.findMany({ where: { companyId, bankAccountId }, orderBy: { statementEndDate: "desc" } });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

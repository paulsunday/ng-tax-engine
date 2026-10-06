import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { JournalService } from "../journal/journal.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import {
  TransactionLike,
  detectDuplicateTransactions,
  detectMissingDocumentation,
  detectLargeTransactions,
  detectRoundNumberAnomalies,
  detectRepeatedCounterparty,
  detectPeriodCutoffIssues,
  checkTaxConsistency,
  checkLedgerBalance,
  DetectedFinding,
} from "../../audit/detectors";

/**
 * Normal Audit (brief §11): imports actual records, checks for anomalies, and produces
 * findings — never fabricates a finding, never overwrites the source transactions it
 * examines. Every finding traces to a real Invoice/Expense/BankTransaction/ledger row.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly journal: JournalService,
    private readonly auditLog: AuditLogService
  ) {}

  async runNormalAudit(organizationId: string, companyId: string, userId: string, periodStart: Date, periodEnd: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);

    const auditRun = await this.prisma.auditRun.create({
      data: { organizationId, companyId, runType: "NORMAL_AUDIT", periodStart, periodEnd, status: "RUNNING", runBy: userId },
    });

    try {
      const findings = await this.collectFindings(organizationId, companyId, periodStart, periodEnd);

      await this.prisma.$transaction(
        findings.map((f) =>
          this.prisma.auditFinding.create({
            data: {
              auditRunId: auditRun.id,
              category: f.category,
              severity: f.severity,
              description: f.description,
              relatedEntityType: f.relatedEntityType,
              relatedEntityId: f.relatedEntityId,
            },
          })
        )
      );

      const completed = await this.prisma.auditRun.update({
        where: { id: auditRun.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      await this.auditLog.record({
        organizationId,
        userId,
        action: "RUN_AUDIT",
        objectType: "AuditRun",
        objectId: auditRun.id,
        newValue: { findingCount: findings.length },
      });

      return this.getRunWithFindings(organizationId, companyId, auditRun.id);
    } catch (err) {
      await this.prisma.auditRun.update({ where: { id: auditRun.id }, data: { status: "FAILED" } });
      throw err;
    }
  }

  private async collectFindings(organizationId: string, companyId: string, periodStart: Date, periodEnd: Date): Promise<DetectedFinding[]> {
    const [invoices, expenses, bankTransactions, trialBalance] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { companyId, status: { not: "DRAFT" }, issueDate: { gte: periodStart, lte: periodEnd } },
        include: { customer: true },
      }),
      this.prisma.expense.findMany({
        where: { companyId, status: { not: "DRAFT" }, expenseDate: { gte: periodStart, lte: periodEnd } },
        include: { supplier: true },
      }),
      this.prisma.bankTransaction.findMany({ where: { companyId, transactionDate: { gte: periodStart, lte: periodEnd } } }),
      this.journal.getTrialBalance(organizationId, companyId, periodEnd),
    ]);

    const documentLinks = await this.prisma.document.findMany({
      where: { companyId, linkedEntityType: { in: ["Invoice", "Expense"] } },
      select: { linkedEntityType: true, linkedEntityId: true },
    });
    const documentedIds = new Set(documentLinks.map((d) => `${d.linkedEntityType}:${d.linkedEntityId}`));

    const invoiceTxns: TransactionLike[] = invoices.map((inv) => ({
      id: inv.id,
      entityType: "Invoice",
      amountNgn: Number(inv.totalNgn),
      date: inv.issueDate,
      counterpartyId: inv.customerId,
      counterpartyName: inv.customer.name,
      hasDocument: documentedIds.has(`Invoice:${inv.id}`),
      createdAt: inv.createdAt,
    }));

    const expenseTxns: TransactionLike[] = expenses.map((exp) => ({
      id: exp.id,
      entityType: "Expense",
      amountNgn: Number(exp.totalNgn),
      date: exp.expenseDate,
      counterpartyId: exp.supplierId,
      counterpartyName: exp.supplier?.name ?? null,
      hasDocument: documentedIds.has(`Expense:${exp.id}`),
      createdAt: exp.createdAt,
    }));

    const allTxns = [...invoiceTxns, ...expenseTxns];

    const findings: DetectedFinding[] = [
      ...detectDuplicateTransactions(allTxns),
      ...detectMissingDocumentation(allTxns),
      ...detectLargeTransactions(invoiceTxns),
      ...detectLargeTransactions(expenseTxns),
      ...detectRoundNumberAnomalies(allTxns),
      ...detectRepeatedCounterparty(invoiceTxns),
      ...detectRepeatedCounterparty(expenseTxns),
      ...detectPeriodCutoffIssues(allTxns),
      ...checkLedgerBalance(trialBalance.totalDebit, trialBalance.totalCredit),
    ];

    const vatPayableRow = trialBalance.rows.find((r) => r.name === "VAT Payable");
    const invoiceVatTotal = invoices.reduce((acc, inv) => acc + Number(inv.vatAmountNgn), 0);
    if (vatPayableRow) {
      findings.push(...checkTaxConsistency(invoiceVatTotal, vatPayableRow.creditNgn - vatPayableRow.debitNgn));
    }

    const unreconciled = bankTransactions.filter((t) => t.matchStatus === "UNMATCHED");
    for (const txn of unreconciled) {
      findings.push({
        category: "UNRECONCILED_BANK_TRANSACTION",
        severity: "LOW",
        description: `Bank transaction dated ${txn.transactionDate.toISOString().slice(0, 10)} ("${txn.narration}") remains unmatched to any ledger entry.`,
        relatedEntityType: "BankTransaction",
        relatedEntityId: txn.id,
      });
    }

    return findings;
  }

  async getRunWithFindings(organizationId: string, companyId: string, auditRunId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const run = await this.prisma.auditRun.findUnique({ where: { id: auditRunId }, include: { findings: true } });
    if (!run || run.companyId !== companyId) throw new NotFoundException("Audit run not found.");
    return run;
  }

  async listRuns(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.auditRun.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
  }

  async resolveFinding(organizationId: string, companyId: string, userId: string, findingId: string, status: "RESOLVED" | "DISMISSED", resolutionNotes: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const finding = await this.prisma.auditFinding.findUnique({ where: { id: findingId }, include: { auditRun: true } });
    if (!finding || finding.auditRun.companyId !== companyId) throw new NotFoundException("Audit finding not found.");

    const updated = await this.prisma.auditFinding.update({ where: { id: findingId }, data: { status, resolutionNotes } });
    await this.auditLog.record({ organizationId, userId, action: "RESOLVE_FINDING", objectType: "AuditFinding", objectId: findingId, newValue: { status, resolutionNotes } });
    return updated;
  }
}

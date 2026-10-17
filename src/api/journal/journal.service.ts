import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { JournalEntrySource } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { validateJournalLines, buildReversalLines, JournalLineInput } from "../../accounting/doubleEntry";

export interface PostJournalEntryInput {
  entryDate: Date;
  description: string;
  source: JournalEntrySource;
  sourceId?: string;
  documentReference?: string;
  lines: JournalLineInput[];
}

/**
 * The single chokepoint through which any ledger posting happens — invoices, expenses,
 * assets, bank imports, and manual entries all call JournalService.postEntry() rather
 * than writing JournalEntry/JournalLine rows directly, so double-entry validation (brief
 * §6) and the "never edit a posted entry" rule (brief §11/§41) are enforced exactly once.
 */
@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly auditLog: AuditLogService
  ) {}

  async postEntry(organizationId: string, companyId: string, userId: string, input: PostJournalEntryInput) {
    await this.companies.getOneOrThrow(organizationId, companyId);

    // Throws InvalidJournalLineError/UnbalancedJournalEntryError — never caught here.
    // An invalid entry must fail the whole request, not be silently skipped or partially posted.
    validateJournalLines(input.lines);

    const accountIds = [...new Set(input.lines.map((l) => l.accountId))];
    const accounts = await this.prisma.account.findMany({ where: { id: { in: accountIds }, companyId } });
    if (accounts.length !== accountIds.length) {
      throw new BadRequestException("One or more accounts do not exist for this company — cannot post.");
    }

    const entry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.journalEntry.create({
        data: {
          organizationId,
          companyId,
          entryDate: input.entryDate,
          description: input.description,
          source: input.source,
          sourceId: input.sourceId,
          documentReference: input.documentReference,
          status: "POSTED",
          postedAt: new Date(),
          createdBy: userId,
          lines: {
            create: input.lines.map((l) => ({
              accountId: l.accountId,
              debitNgn: l.debitNgn,
              creditNgn: l.creditNgn,
              description: l.description,
            })),
          },
        },
        include: { lines: true },
      });
      return created;
    });

    await this.auditLog.record({
      organizationId,
      userId,
      action: "POST",
      objectType: "JournalEntry",
      objectId: entry.id,
      newValue: { description: entry.description, source: entry.source, lineCount: entry.lines.length },
    });

    return entry;
  }

  /**
   * Reverses a POSTED entry by posting a NEW entry with debits/credits swapped, then
   * flags the original VOID. The original's lines are never edited or deleted — brief
   * §11 ("never overwrite source transactions") and §41 ("never modify an already
   * executed production migration" applied to ledger postings, not just schema).
   */
  async voidEntry(organizationId: string, companyId: string, userId: string, journalEntryId: string, reason: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);

    const entry = await this.prisma.journalEntry.findUnique({ where: { id: journalEntryId }, include: { lines: true } });
    if (!entry || entry.companyId !== companyId) throw new NotFoundException("Journal entry not found.");
    if (entry.status !== "POSTED") {
      throw new BadRequestException(`Cannot void a journal entry with status "${entry.status}" — only POSTED entries can be voided.`);
    }

    const reversalLines: JournalLineInput[] = buildReversalLines(
      entry.lines.map((l) => ({ accountId: l.accountId, debitNgn: Number(l.debitNgn), creditNgn: Number(l.creditNgn), description: l.description ?? undefined }))
    );

    const reversalEntry = await this.prisma.$transaction(async (tx) => {
      const reversal = await tx.journalEntry.create({
        data: {
          organizationId,
          companyId,
          entryDate: new Date(),
          description: `Void: ${entry.description} — ${reason}`,
          source: "ADJUSTMENT",
          reversalOfId: entry.id,
          status: "POSTED",
          postedAt: new Date(),
          createdBy: userId,
          lines: { create: reversalLines.map((l) => ({ accountId: l.accountId, debitNgn: l.debitNgn, creditNgn: l.creditNgn, description: l.description })) },
        },
        include: { lines: true },
      });
      await tx.journalEntry.update({ where: { id: entry.id }, data: { status: "VOID" } });
      return reversal;
    });

    await this.auditLog.record({
      organizationId,
      userId,
      action: "VOID",
      objectType: "JournalEntry",
      objectId: entry.id,
      previousValue: { status: "POSTED" },
      newValue: { status: "VOID", reversalEntryId: reversalEntry.id },
      reason,
    });

    return reversalEntry;
  }

  /**
   * Sums debit/credit per account across all POSTED (non-VOID) entries, optionally as of
   * a given date. Also returns totalDebit/totalCredit so callers (and tests) can assert
   * the fundamental invariant: a correctly-posted ledger's trial balance ALWAYS balances.
   */
  async getTrialBalance(organizationId: string, companyId: string, asOfDate?: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);

    const lines = await this.prisma.journalLine.findMany({
      where: {
        journalEntry: {
          companyId,
          status: "POSTED",
          ...(asOfDate ? { entryDate: { lte: asOfDate } } : {}),
        },
      },
      include: { account: true },
    });

    const byAccount = new Map<string, { accountId: string; code: string; name: string; type: string; debitNgn: number; creditNgn: number }>();
    for (const line of lines) {
      const key = line.accountId;
      const existing = byAccount.get(key) ?? { accountId: key, code: line.account.code, name: line.account.name, type: line.account.type, debitNgn: 0, creditNgn: 0 };
      existing.debitNgn += Number(line.debitNgn);
      existing.creditNgn += Number(line.creditNgn);
      byAccount.set(key, existing);
    }

    const rows = [...byAccount.values()].sort((a, b) => a.code.localeCompare(b.code));
    const totalDebit = round2(rows.reduce((acc, r) => acc + r.debitNgn, 0));
    const totalCredit = round2(rows.reduce((acc, r) => acc + r.creditNgn, 0));

    return { rows, totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 };
  }

  /**
   * The general-ledger drill-down for a single account: every POSTED line in date order
   * with a running balance, plus an opening balance carried in from before periodStart (if
   * given). This is the "account of debits and credits" view the trial balance's per-account
   * totals don't show on their own.
   */
  async getAccountLedger(organizationId: string, companyId: string, accountId: string, periodStart?: Date, periodEnd?: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);

    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account || account.companyId !== companyId) throw new NotFoundException("Account not found.");

    let openingBalanceNgn = 0;
    if (periodStart) {
      const dayBefore = new Date(periodStart);
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      const priorLines = await this.prisma.journalLine.findMany({
        where: { accountId, journalEntry: { companyId, status: "POSTED", entryDate: { lte: dayBefore } } },
      });
      openingBalanceNgn = priorLines.reduce((bal, l) => bal + signedMovement(account.type, Number(l.debitNgn), Number(l.creditNgn)), 0);
    }

    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId,
        journalEntry: {
          companyId,
          status: "POSTED",
          ...(periodStart ? { entryDate: { gte: periodStart } } : {}),
          ...(periodEnd ? { entryDate: { lte: periodEnd } } : {}),
        },
      },
      include: { journalEntry: true },
    });
    lines.sort((a, b) => a.journalEntry.entryDate.getTime() - b.journalEntry.entryDate.getTime());

    let runningBalanceNgn = round2(openingBalanceNgn);
    const entries = lines.map((l) => {
      runningBalanceNgn = round2(runningBalanceNgn + signedMovement(account.type, Number(l.debitNgn), Number(l.creditNgn)));
      return {
        journalEntryId: l.journalEntryId,
        entryDate: l.journalEntry.entryDate,
        description: l.journalEntry.description,
        source: l.journalEntry.source,
        debitNgn: Number(l.debitNgn),
        creditNgn: Number(l.creditNgn),
        runningBalanceNgn,
      };
    });

    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      openingBalanceNgn: round2(openingBalanceNgn),
      entries,
      closingBalanceNgn: runningBalanceNgn,
    };
  }
}

/** Credit-normal account types (LIABILITY/EQUITY/REVENUE) move up on a credit; everything else (ASSET/EXPENSE) moves up on a debit. */
function signedMovement(accountType: string, debitNgn: number, creditNgn: number): number {
  const creditNormal = accountType === "LIABILITY" || accountType === "EQUITY" || accountType === "REVENUE";
  return creditNormal ? creditNgn - debitNgn : debitNgn - creditNgn;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

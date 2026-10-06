import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { RULE_REPOSITORY } from "../tax-rules/tax-rules.constants";
import { RuleRepository } from "../../rules/RuleRepository";
import { determineWht, RecipientCategory } from "../../engine/wht";

export interface RecordTransactionInput {
  counterpartyName: string;
  counterpartyTin?: string;
  counterpartyIsCorporate: boolean;
  counterpartyIsResident: boolean;
  transactionCategory: string;
  grossAmountNgn: number;
  transactionDate: Date;
}

/**
 * WHT determination (src/engine/wht.ts) wired to real BusinessTransaction records. The
 * small-supplier de-minimis exemption always resolves REQUIRES_REVIEW today — see
 * research report §8 item 7 — this is surfaced via confidence, not silently approximated.
 */
@Injectable()
export class WhtDeterminationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    @Inject(RULE_REPOSITORY) private readonly rules: RuleRepository
  ) {}

  async recordAndDetermine(organizationId: string, companyId: string, input: RecordTransactionInput, supplierIsSmallCompany: boolean, asOfDate: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);

    const monthStart = new Date(input.transactionDate.getFullYear(), input.transactionDate.getMonth(), 1);
    const monthEnd = new Date(input.transactionDate.getFullYear(), input.transactionDate.getMonth() + 1, 0);
    const priorThisMonth = await this.prisma.businessTransaction.aggregate({
      where: { companyId, counterpartyName: input.counterpartyName, transactionDate: { gte: monthStart, lte: monthEnd } },
      _sum: { grossAmountNgn: true },
    });
    const cumulativeMonthlyValueWithSameSupplierNgn = Number(priorThisMonth._sum.grossAmountNgn ?? 0) + input.grossAmountNgn;

    const recipientCategory: RecipientCategory = `${input.counterpartyIsResident ? "resident" : "nonresident"}_${input.counterpartyIsCorporate ? "corporate" : "noncorporate"}` as RecipientCategory;

    const result = determineWht(
      {
        transactionCategory: input.transactionCategory,
        grossAmountNgn: input.grossAmountNgn,
        cumulativeMonthlyValueWithSameSupplierNgn,
        recipientCategory,
        recipientHasValidTin: !!input.counterpartyTin,
        supplierIsSmallCompany,
      },
      this.rules,
      asOfDate.toISOString().slice(0, 10)
    );

    const transaction = await this.prisma.businessTransaction.create({
      data: {
        companyId,
        counterpartyName: input.counterpartyName,
        counterpartyTin: input.counterpartyTin,
        counterpartyIsCorporate: input.counterpartyIsCorporate,
        counterpartyIsResident: input.counterpartyIsResident,
        transactionCategory: input.transactionCategory,
        grossAmountNgn: input.grossAmountNgn,
        transactionDate: input.transactionDate,
        whtDetermination: {
          create: {
            applicable: result.applicable,
            rateApplied: result.rateApplied,
            whtAmountNgn: result.whtAmountNgn,
            netPaymentNgn: result.netPaymentNgn,
            exemptionReason: result.exemptionReason,
            ruleVersionId: result.ruleIdsUsed[0] ?? null,
            explanation: result.explanation,
            confidence: result.confidence,
          },
        },
      },
      include: { whtDetermination: true },
    });

    return transaction;
  }

  async getTotalWhtForPeriod(companyId: string, periodStart: Date, periodEnd: Date): Promise<number> {
    const transactions = await this.prisma.businessTransaction.findMany({
      where: { companyId, transactionDate: { gte: periodStart, lte: periodEnd } },
      include: { whtDetermination: true },
    });
    return transactions.reduce((acc, t) => acc + Number(t.whtDetermination?.whtAmountNgn ?? 0), 0);
  }

  async listForCompany(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.businessTransaction.findMany({ where: { companyId }, include: { whtDetermination: true }, orderBy: { transactionDate: "desc" } });
  }

  async getOneOrThrow(organizationId: string, companyId: string, transactionId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const transaction = await this.prisma.businessTransaction.findUnique({ where: { id: transactionId }, include: { whtDetermination: true } });
    if (!transaction || transaction.companyId !== companyId) throw new NotFoundException("Business transaction not found.");
    return transaction;
  }
}

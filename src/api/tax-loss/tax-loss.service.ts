import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { applyLossRelief, TaxLossEntryInput } from "../../engine/taxLoss";

export interface RecordLossInput {
  tradeOrBusiness: string;
  yearIncurred: number;
  originalLossNgn: number;
  isDigitalAsset?: boolean;
}

@Injectable()
export class TaxLossService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService
  ) {}

  async recordLoss(organizationId: string, companyId: string, input: RecordLossInput) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.taxLossEntry.create({
      data: {
        companyId,
        tradeOrBusiness: input.tradeOrBusiness,
        yearIncurred: input.yearIncurred,
        originalLossNgn: input.originalLossNgn,
        remainingLossNgn: input.originalLossNgn,
        isDigitalAsset: input.isDigitalAsset ?? false,
      },
    });
  }

  /**
   * Applies NTA s.27(5)-(6) loss relief (oldest-first, same-trade-only, no carry-back —
   * see src/engine/taxLoss.ts) against a given year's assessable profit, persisting the
   * utilisation against each TaxLossEntry so remainingLossNgn stays accurate going forward.
   */
  async applyRelief(organizationId: string, companyId: string, tradeOrBusiness: string, assessableProfitNgn: number, isDigitalAssetTrade: boolean, yearOfAssessment: number, taxReturnId?: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);

    const entries = await this.prisma.taxLossEntry.findMany({ where: { companyId, tradeOrBusiness, isDigitalAsset: isDigitalAssetTrade } });
    const entryInputs: TaxLossEntryInput[] = entries.map((e) => ({
      id: e.id,
      tradeOrBusiness: e.tradeOrBusiness,
      yearIncurred: e.yearIncurred,
      originalLossNgn: Number(e.originalLossNgn),
      remainingLossNgn: Number(e.remainingLossNgn),
      isDigitalAsset: e.isDigitalAsset,
    }));

    const result = applyLossRelief(tradeOrBusiness, assessableProfitNgn, isDigitalAssetTrade, entryInputs, yearOfAssessment);

    await this.prisma.$transaction(
      result.utilisationsByEntry
        .filter((u) => u.amountUtilisedNgn > 0)
        .flatMap((u) => [
          this.prisma.taxLossUtilisation.create({
            data: { lossEntryId: u.lossEntryId, yearUtilised: yearOfAssessment, amountUtilisedNgn: u.amountUtilisedNgn, taxReturnId },
          }),
          this.prisma.taxLossEntry.update({ where: { id: u.lossEntryId }, data: { remainingLossNgn: u.remainingLossNgn } }),
        ])
    );

    return result;
  }

  async getScheduleForCompany(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.taxLossEntry.findMany({ where: { companyId }, include: { utilisations: true }, orderBy: { yearIncurred: "asc" } });
  }
}

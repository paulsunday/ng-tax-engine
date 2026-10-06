import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { RULE_REPOSITORY } from "../tax-rules/tax-rules.constants";
import { RuleRepository } from "../../rules/RuleRepository";
import { computeCapitalAllowanceForYear, CapitalAssetInput } from "../../engine/capitalAllowance";

export interface CreateCapitalAssetInput {
  description: string;
  assetClass: 1 | 2 | 3;
  qualifyingExpenditureNgn: number;
  acquisitionDate: Date;
  businessUsePercent?: number;
}

/**
 * Tax capital allowance register — independent of the Phase-2 accounting Asset/
 * depreciation tables (brief §14, research report §2.6). A company may well have both a
 * CapitalAsset (tax) row and an Asset (accounting) row for the same physical item, with
 * two different numbers, and that is correct, not a bug.
 */
@Injectable()
export class CapitalAllowanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    @Inject(RULE_REPOSITORY) private readonly rules: RuleRepository
  ) {}

  async createAsset(organizationId: string, companyId: string, input: CreateCapitalAssetInput) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.capitalAsset.create({
      data: {
        companyId,
        description: input.description,
        assetClass: input.assetClass,
        qualifyingExpenditureNgn: input.qualifyingExpenditureNgn,
        acquisitionDate: input.acquisitionDate,
        businessUsePercent: input.businessUsePercent ?? 100,
      },
    });
  }

  /**
   * Computes and persists the claim for one asset for one year of assessment. Idempotent
   * via the (assetId, yearOfAssessment) unique constraint — a second attempt throws
   * rather than double-claiming, same pattern as AssetsService.postMonthlyDepreciation.
   */
  async claimForYear(organizationId: string, companyId: string, assetId: string, yearOfAssessment: number, asOfDate: Date) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const asset = await this.prisma.capitalAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.companyId !== companyId) throw new NotFoundException("Capital asset not found.");

    const existing = await this.prisma.capitalAllowanceClaim.findUnique({ where: { assetId_yearOfAssessment: { assetId, yearOfAssessment } } });
    if (existing) throw new BadRequestException(`Capital allowance for year ${yearOfAssessment} has already been claimed for this asset.`);

    const priorClaims = await this.prisma.capitalAllowanceClaim.aggregate({ where: { assetId }, _sum: { allowanceClaimedNgn: true } });
    const priorAllowanceClaimedNgn = Number(priorClaims._sum.allowanceClaimedNgn ?? 0);

    const input: CapitalAssetInput = {
      id: asset.id,
      description: asset.description,
      assetClass: asset.assetClass as 1 | 2 | 3,
      qualifyingExpenditureNgn: Number(asset.qualifyingExpenditureNgn),
      acquisitionDate: asset.acquisitionDate.toISOString().slice(0, 10),
      disposalDate: asset.disposalDate?.toISOString().slice(0, 10) ?? null,
      businessUsePercent: Number(asset.businessUsePercent),
      priorAllowanceClaimedNgn,
    };

    const result = computeCapitalAllowanceForYear(input, yearOfAssessment, 365, 365, this.rules, asOfDate.toISOString().slice(0, 10));

    const claim = await this.prisma.capitalAllowanceClaim.create({
      data: {
        assetId,
        yearOfAssessment,
        openingResidueNgn: result.openingResidueNgn,
        allowanceClaimedNgn: result.allowanceClaimedNgn,
        notionalResidueNgn: result.notionalResidueNgn,
        closingResidueNgn: result.closingResidueNgn,
        ruleVersionId: result.ruleIdsUsed[0] ?? "unknown", // JSON rule id — see TaxReturn follow-up note on TaxRuleVersion wiring
      },
    });

    return { claim, explanation: result.explanation, confidence: result.confidence };
  }

  async getTotalClaimedForYear(companyId: string, yearOfAssessment: number): Promise<number> {
    const claims = await this.prisma.capitalAllowanceClaim.findMany({
      where: { yearOfAssessment, asset: { companyId } },
    });
    return claims.reduce((acc, c) => acc + Number(c.allowanceClaimedNgn), 0);
  }

  async listAssets(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.capitalAsset.findMany({ where: { companyId }, include: { claims: true } });
  }
}

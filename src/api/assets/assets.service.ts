import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { AccountsService } from "../accounts/accounts.service";
import { JournalService } from "../journal/journal.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { SYSTEM_ACCOUNT_CODES } from "../../accounting/defaultChartOfAccounts";
import { calculateStraightLineMonthlyDepreciation } from "../../accounting/depreciation";

export interface CreateAssetInput {
  description: string;
  category?: string;
  acquisitionDate: Date;
  costNgn: number;
  salvageValueNgn?: number;
  usefulLifeMonths: number;
  paidImmediately: boolean; // true -> credit Cash on acquisition; false -> credit Accounts Payable
}

/**
 * ACCOUNTING asset register. Deliberately does not touch src/engine/capitalAllowance.ts
 * (the TAX capital-allowance register) — see research report §2.6 and the Asset model's
 * own schema comment. A company's accounting useful life and the statutory capital
 * allowance class/rate are two independent numbers, even for the exact same physical asset.
 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly accounts: AccountsService,
    private readonly journal: JournalService,
    private readonly auditLog: AuditLogService
  ) {}

  async create(organizationId: string, companyId: string, userId: string, input: CreateAssetInput) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    if (input.costNgn <= 0) throw new BadRequestException("costNgn must be positive.");
    if ((input.salvageValueNgn ?? 0) > input.costNgn) throw new BadRequestException("salvageValueNgn cannot exceed costNgn.");
    if (input.usefulLifeMonths <= 0) throw new BadRequestException("usefulLifeMonths must be positive.");

    const fixedAssets = await this.accounts.getByCodeOrThrow(organizationId, companyId, SYSTEM_ACCOUNT_CODES.FIXED_ASSETS);
    const creditAccountCode = input.paidImmediately ? SYSTEM_ACCOUNT_CODES.CASH : SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE;
    const creditAccount = await this.accounts.getByCodeOrThrow(organizationId, companyId, creditAccountCode);

    const entry = await this.journal.postEntry(organizationId, companyId, userId, {
      entryDate: input.acquisitionDate,
      description: `Acquisition: ${input.description}`,
      source: "ASSET_ACQUISITION",
      lines: [
        { accountId: fixedAssets.id, debitNgn: input.costNgn, creditNgn: 0, description: input.description },
        { accountId: creditAccount.id, debitNgn: 0, creditNgn: input.costNgn, description: input.description },
      ],
    });

    const asset = await this.prisma.asset.create({
      data: {
        organizationId,
        companyId,
        description: input.description,
        category: input.category,
        acquisitionDate: input.acquisitionDate,
        costNgn: input.costNgn,
        salvageValueNgn: input.salvageValueNgn ?? 0,
        usefulLifeMonths: input.usefulLifeMonths,
        journalEntryId: entry.id,
      },
    });

    await this.auditLog.record({
      organizationId,
      userId,
      action: "CREATE",
      objectType: "Asset",
      objectId: asset.id,
      newValue: { description: asset.description, costNgn: input.costNgn, journalEntryId: entry.id },
    });

    return asset;
  }

  /**
   * Posts one month's straight-line depreciation: Dr Depreciation Expense,
   * Cr Accumulated Depreciation. Idempotent per (asset, year, month) via the DB unique
   * constraint — calling this twice for the same period throws ConflictException rather
   * than double-posting (brief §51: "A job must never accidentally submit the same ...
   * twice", applied here to depreciation runs instead of tax filings).
   */
  async postMonthlyDepreciation(organizationId: string, companyId: string, userId: string, assetId: string, periodYear: number, periodMonth: number) {
    const asset = await this.getOneOrThrow(organizationId, companyId, assetId);

    const existing = await this.prisma.assetDepreciationEntry.findUnique({
      where: { assetId_periodYear_periodMonth: { assetId, periodYear, periodMonth } },
    });
    if (existing) throw new ConflictException(`Depreciation for ${periodYear}-${periodMonth} has already been posted for this asset.`);

    const result = calculateStraightLineMonthlyDepreciation({
      costNgn: Number(asset.costNgn),
      salvageValueNgn: Number(asset.salvageValueNgn),
      usefulLifeMonths: asset.usefulLifeMonths,
      accumulatedDepreciationNgn: Number(asset.accumulatedDepreciationNgn),
    });

    if (result.amountNgn <= 0) {
      throw new BadRequestException("Asset is already fully depreciated — nothing to post.");
    }

    const depreciationExpense = await this.accounts.getByCodeOrThrow(organizationId, companyId, SYSTEM_ACCOUNT_CODES.DEPRECIATION_EXPENSE);
    const accumulatedDepreciation = await this.accounts.getByCodeOrThrow(organizationId, companyId, SYSTEM_ACCOUNT_CODES.ACCUMULATED_DEPRECIATION);

    const entry = await this.journal.postEntry(organizationId, companyId, userId, {
      entryDate: new Date(Date.UTC(periodYear, periodMonth - 1, 1)),
      description: `Depreciation: ${asset.description} (${periodYear}-${String(periodMonth).padStart(2, "0")})`,
      source: "DEPRECIATION",
      sourceId: asset.id,
      lines: [
        { accountId: depreciationExpense.id, debitNgn: result.amountNgn, creditNgn: 0 },
        { accountId: accumulatedDepreciation.id, debitNgn: 0, creditNgn: result.amountNgn },
      ],
    });

    const [depreciationEntry] = await this.prisma.$transaction([
      this.prisma.assetDepreciationEntry.create({
        data: { assetId, periodYear, periodMonth, amountNgn: result.amountNgn, journalEntryId: entry.id },
      }),
      this.prisma.asset.update({ where: { id: asset.id }, data: { accumulatedDepreciationNgn: result.accumulatedAfterNgn } }),
    ]);

    return { depreciationEntry, netBookValueAfterNgn: result.netBookValueAfterNgn, isFullyDepreciated: result.isFullyDepreciated };
  }

  async listForCompany(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.asset.findMany({ where: { companyId }, orderBy: { acquisitionDate: "desc" } });
  }

  async getOneOrThrow(organizationId: string, companyId: string, assetId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset || asset.companyId !== companyId) throw new NotFoundException("Asset not found.");
    return asset;
  }
}

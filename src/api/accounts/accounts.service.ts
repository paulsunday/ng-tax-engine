import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AccountType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { DEFAULT_CHART_OF_ACCOUNTS } from "../../accounting/defaultChartOfAccounts";

export interface CreateAccountInput {
  code: string;
  name: string;
  type: AccountType;
  parentAccountId?: string;
}

/**
 * Every public method takes (organizationId, companyId, ...) and verifies the company
 * belongs to that organization via CompaniesService.getOneOrThrow BEFORE touching any
 * Account row — the same defense-in-depth tenant check CompaniesService itself uses,
 * repeated here rather than trusted solely from the controller layer (brief §4).
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService
  ) {}

  /** Called once, right after a Company is created — seeds the standard starter CoA. */
  async seedDefaultChartOfAccounts(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    await this.prisma.$transaction(
      DEFAULT_CHART_OF_ACCOUNTS.map((a) =>
        this.prisma.account.create({
          data: { organizationId, companyId, code: a.code, name: a.name, type: a.type, isSystemAccount: true },
        })
      )
    );
  }

  async create(organizationId: string, companyId: string, input: CreateAccountInput) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const existing = await this.prisma.account.findUnique({ where: { companyId_code: { companyId, code: input.code } } });
    if (existing) throw new ConflictException(`An account with code "${input.code}" already exists for this company.`);

    return this.prisma.account.create({
      data: { organizationId, companyId, code: input.code, name: input.name, type: input.type, parentAccountId: input.parentAccountId },
    });
  }

  async listForCompany(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.account.findMany({ where: { companyId }, orderBy: { code: "asc" } });
  }

  async getByCodeOrThrow(organizationId: string, companyId: string, code: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const account = await this.prisma.account.findUnique({ where: { companyId_code: { companyId, code } } });
    if (!account) throw new NotFoundException(`Account with code "${code}" not found for this company.`);
    return account;
  }

  async getByIdOrThrow(organizationId: string, companyId: string, accountId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account || account.companyId !== companyId) throw new NotFoundException("Account not found.");
    return account;
  }
}

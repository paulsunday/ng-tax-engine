import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";

export interface CreateBankAccountInput {
  accountName: string;
  bankName: string;
  accountNumber: string;
  currency?: string;
  openingBalanceNgn?: number;
  glAccountId?: string;
}

@Injectable()
export class BankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService
  ) {}

  async create(organizationId: string, companyId: string, input: CreateBankAccountInput) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.bankAccount.create({
      data: {
        organizationId,
        companyId,
        accountName: input.accountName,
        bankName: input.bankName,
        accountNumber: input.accountNumber,
        currency: input.currency ?? "NGN",
        openingBalanceNgn: input.openingBalanceNgn ?? 0,
        glAccountId: input.glAccountId,
      },
    });
  }

  async listForCompany(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.bankAccount.findMany({ where: { companyId }, orderBy: { accountName: "asc" } });
  }

  async getOneOrThrow(organizationId: string, companyId: string, bankAccountId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const account = await this.prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!account || account.companyId !== companyId) throw new NotFoundException("Bank account not found.");
    return account;
  }
}

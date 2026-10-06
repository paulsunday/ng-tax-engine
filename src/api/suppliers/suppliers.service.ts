import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";

export interface CreateSupplierInput {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
}

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService
  ) {}

  async create(organizationId: string, companyId: string, input: CreateSupplierInput) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.supplier.create({ data: { organizationId, companyId, ...input } });
  }

  async listForCompany(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  }

  async getOneOrThrow(organizationId: string, companyId: string, supplierId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier || supplier.companyId !== companyId) throw new NotFoundException("Supplier not found.");
    return supplier;
  }
}

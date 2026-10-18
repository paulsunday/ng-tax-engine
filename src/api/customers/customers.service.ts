import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";

export interface CreateCustomerInput {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  // Set only by a connected-app sync (IntegrationsService.syncSubscriberInvoice) — null for
  // every customer entered by hand. See Customer.externalRef's own schema comment.
  externalRef?: string;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService
  ) {}

  async create(organizationId: string, companyId: string, input: CreateCustomerInput) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.customer.create({ data: { organizationId, companyId, ...input } });
  }

  async listForCompany(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.customer.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  }

  async getOneOrThrow(organizationId: string, companyId: string, customerId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.companyId !== companyId) throw new NotFoundException("Customer not found.");
    return customer;
  }
}

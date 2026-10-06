import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { CreateCompanyDto } from "./dto/create-company.dto";

/**
 * Every method here takes organizationId explicitly and filters by it — this is the
 * resource-level tenant-isolation enforcement that TenantGuard alone cannot provide for
 * routes keyed by companyId rather than organizationId (brief §4).
 */
@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService
  ) {}

  async create(organizationId: string, actingUserId: string, dto: CreateCompanyDto) {
    const company = await this.prisma.company.create({
      data: {
        organizationId,
        name: dto.name,
        rcNumber: dto.rcNumber,
        tin: dto.tin,
        incorporationDate: new Date(dto.incorporationDate),
        accountingYearEnd: dto.accountingYearEnd,
        isResident: dto.isResident ?? true,
        sector: dto.sector,
        isProfessionalServices: dto.isProfessionalServices ?? false,
        vatRegistered: dto.vatRegistered ?? false,
        headOfficeStateCode: dto.headOfficeStateCode,
      },
    });

    await this.auditLog.record({
      organizationId,
      userId: actingUserId,
      action: "CREATE",
      objectType: "Company",
      objectId: company.id,
      newValue: company,
    });

    return company;
  }

  async listForOrganization(organizationId: string) {
    return this.prisma.company.findMany({ where: { organizationId } });
  }

  async getOneOrThrow(organizationId: string, companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException("Company not found.");
    if (company.organizationId !== organizationId) {
      // Deliberately the SAME exception as "not found" — never confirm to a caller that a
      // company with this ID exists in a DIFFERENT tenant (brief §4: no cross-tenant leakage,
      // not even leakage of existence).
      throw new NotFoundException("Company not found.");
    }
    return company;
  }
}

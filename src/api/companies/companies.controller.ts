import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { CompaniesService } from "./companies.service";
import { CreateCompanyDto } from "./dto/create-company.dto";

@Controller("companies")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.MANAGE_COMPANY_SETTINGS)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCompanyDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.companies.create(user.organizationId, user.sub, dto);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.companies.listForOrganization(user.organizationId);
  }

  @Get(":companyId")
  getOne(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.companies.getOneOrThrow(user.organizationId, companyId);
  }

  @Get(":companyId/export")
  @RequirePermissions(PERMISSIONS.EXPORT_REPORTS)
  exportBusinessRecords(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.companies.exportBusinessRecords(user.organizationId, user.sub, companyId);
  }
}

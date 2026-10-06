import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { AccountsService } from "./accounts.service";
import { CreateAccountDto } from "./dto/create-account.dto";

@Controller("companies/:companyId/accounts")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
  list(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.accounts.listForCompany(user.organizationId, companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MANAGE_COMPANY_SETTINGS)
  create(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: CreateAccountDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.accounts.create(user.organizationId, companyId, dto);
  }

  /** Call once right after creating a company to seed the standard starter chart of accounts. */
  @Post("seed-defaults")
  @RequirePermissions(PERMISSIONS.MANAGE_COMPANY_SETTINGS)
  async seedDefaults(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    await this.accounts.seedDefaultChartOfAccounts(user.organizationId, companyId);
    return this.accounts.listForCompany(user.organizationId, companyId);
  }
}

import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { TaxReturnsService } from "./tax-returns.service";
import { RejectReturnDto } from "./dto/reject-return.dto";

@Controller("companies/:companyId/tax-returns")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TaxReturnsController {
  constructor(private readonly taxReturns: TaxReturnsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_TAX_HISTORY)
  list(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.taxReturns.listForCompany(user.organizationId, companyId);
  }

  @Get(":taxReturnId")
  @RequirePermissions(PERMISSIONS.VIEW_TAX_HISTORY)
  getOne(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("taxReturnId") taxReturnId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.taxReturns.getOneOrThrow(user.organizationId, companyId, taxReturnId);
  }

  @Post(":taxReturnId/validate")
  @RequirePermissions(PERMISSIONS.PREPARE_RETURNS)
  validate(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("taxReturnId") taxReturnId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.taxReturns.validate(user.organizationId, companyId, user.sub, taxReturnId);
  }

  @Post(":taxReturnId/approve")
  @RequirePermissions(PERMISSIONS.APPROVE_TAX_FILING)
  approve(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("taxReturnId") taxReturnId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.taxReturns.approve(user.organizationId, companyId, user.sub, taxReturnId);
  }

  @Post(":taxReturnId/reject")
  @RequirePermissions(PERMISSIONS.APPROVE_TAX_FILING)
  reject(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("taxReturnId") taxReturnId: string, @Body() dto: RejectReturnDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.taxReturns.reject(user.organizationId, companyId, user.sub, taxReturnId, dto.reason);
  }
}

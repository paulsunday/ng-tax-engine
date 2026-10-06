import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { TaxLossService } from "./tax-loss.service";
import { RecordLossDto } from "./dto/record-loss.dto";

@Controller("companies/:companyId/tax-losses")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TaxLossController {
  constructor(private readonly taxLoss: TaxLossService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_TAX_HISTORY)
  getSchedule(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.taxLoss.getScheduleForCompany(user.organizationId, companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MANAGE_TAX_CONFIGURATION)
  record(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: RecordLossDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.taxLoss.recordLoss(user.organizationId, companyId, dto);
  }
}

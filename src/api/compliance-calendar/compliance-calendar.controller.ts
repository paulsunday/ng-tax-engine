import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { ComplianceCalendarService } from "./compliance-calendar.service";
import { CreateCalendarEntryDto } from "./dto/create-calendar-entry.dto";

@Controller("companies/:companyId/compliance-calendar")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ComplianceCalendarController {
  constructor(private readonly calendar: ComplianceCalendarService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_TAX_HISTORY)
  list(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.calendar.listForCompany(user.organizationId, companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PREPARE_RETURNS)
  create(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: CreateCalendarEntryDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.calendar.createForReturn(user.organizationId, companyId, user.sub, dto.taxReturnId, dto.internalSafetyMarginDays, dto.responsibleUserId);
  }

  @Post("refresh-overdue")
  @RequirePermissions(PERMISSIONS.VIEW_TAX_HISTORY)
  refresh(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.calendar.refreshOverdueStatus(user.organizationId, companyId);
  }
}

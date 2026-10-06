import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { AuditService } from "./audit.service";
import { RunAuditDto } from "./dto/run-audit.dto";
import { ResolveFindingDto } from "./dto/resolve-finding.dto";

@Controller("companies/:companyId/audit-runs")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.RUN_AUDIT)
  run(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: RunAuditDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.audit.runNormalAudit(user.organizationId, companyId, user.sub, new Date(dto.periodStart), new Date(dto.periodEnd));
  }

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_AUDIT_LOGS)
  list(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.audit.listRuns(user.organizationId, companyId);
  }

  @Get(":auditRunId")
  @RequirePermissions(PERMISSIONS.VIEW_AUDIT_LOGS)
  getOne(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("auditRunId") auditRunId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.audit.getRunWithFindings(user.organizationId, companyId, auditRunId);
  }

  @Post("findings/:findingId/resolve")
  @RequirePermissions(PERMISSIONS.CREATE_ADJUSTMENTS)
  resolveFinding(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Param("findingId") findingId: string,
    @Body() dto: ResolveFindingDto
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.audit.resolveFinding(user.organizationId, companyId, user.sub, findingId, dto.status, dto.resolutionNotes);
  }
}

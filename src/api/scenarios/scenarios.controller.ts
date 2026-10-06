import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { ScenariosService } from "./scenarios.service";
import { GenerateScenarioDto } from "./dto/generate-scenario.dto";

@Controller("companies/:companyId/scenarios")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ScenariosController {
  constructor(private readonly scenarios: ScenariosService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.RUN_AUDIT)
  generate(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: GenerateScenarioDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.scenarios.generate(user.organizationId, companyId, user.sub, dto.scenarioType, new Date(dto.periodStart), new Date(dto.periodEnd));
  }

  @Get("compare")
  @RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
  compare(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Query("periodStart") periodStart: string,
    @Query("periodEnd") periodEnd: string
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.scenarios.compare(user.organizationId, companyId, new Date(periodStart), new Date(periodEnd));
  }

  @Get(":scenarioId")
  @RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
  getOne(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("scenarioId") scenarioId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.scenarios.getOneOrThrow(user.organizationId, companyId, scenarioId);
  }
}

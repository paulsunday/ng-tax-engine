import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { CapitalAllowanceService } from "./capital-allowance.service";
import { CreateCapitalAssetDto } from "./dto/create-capital-asset.dto";

@Controller("companies/:companyId/capital-assets")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CapitalAllowanceController {
  constructor(private readonly capitalAllowance: CapitalAllowanceService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_TAX_HISTORY)
  list(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.capitalAllowance.listAssets(user.organizationId, companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MANAGE_TAX_CONFIGURATION)
  create(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: CreateCapitalAssetDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.capitalAllowance.createAsset(user.organizationId, companyId, { ...dto, acquisitionDate: new Date(dto.acquisitionDate) });
  }

  @Post(":assetId/claim/:yearOfAssessment")
  @RequirePermissions(PERMISSIONS.CALCULATE_TAXES)
  claim(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Param("assetId") assetId: string,
    @Param("yearOfAssessment") yearOfAssessment: string
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.capitalAllowance.claimForYear(user.organizationId, companyId, assetId, Number(yearOfAssessment), new Date());
  }
}

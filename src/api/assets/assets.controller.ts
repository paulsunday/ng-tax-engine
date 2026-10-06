import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { AssetsService } from "./assets.service";
import { CreateAssetDto } from "./dto/create-asset.dto";
import { PostDepreciationDto } from "./dto/post-depreciation.dto";

@Controller("companies/:companyId/assets")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
  list(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.assets.listForCompany(user.organizationId, companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CREATE_TRANSACTIONS)
  create(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: CreateAssetDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.assets.create(user.organizationId, companyId, user.sub, {
      ...dto,
      acquisitionDate: new Date(dto.acquisitionDate),
    });
  }

  @Post(":assetId/depreciation")
  @RequirePermissions(PERMISSIONS.CREATE_TRANSACTIONS)
  postDepreciation(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Param("assetId") assetId: string,
    @Body() dto: PostDepreciationDto
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.assets.postMonthlyDepreciation(user.organizationId, companyId, user.sub, assetId, dto.periodYear, dto.periodMonth);
  }
}

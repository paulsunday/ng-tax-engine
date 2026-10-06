import { Body, Controller, ForbiddenException, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { TaxCalculationService } from "./tax-calculation.service";
import { ComputeTaxDto } from "./dto/compute-tax.dto";

@Controller("companies/:companyId/tax-calculations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.CALCULATE_TAXES)
export class TaxCalculationController {
  constructor(private readonly taxCalculation: TaxCalculationService) {}

  @Post("cit")
  computeCit(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: ComputeTaxDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.taxCalculation.computeCitAndDevelopmentLevy(user.organizationId, companyId, user.sub, new Date(dto.periodStart), new Date(dto.periodEnd));
  }

  @Post("vat")
  computeVat(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: ComputeTaxDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.taxCalculation.computeVatReturn(user.organizationId, companyId, user.sub, new Date(dto.periodStart), new Date(dto.periodEnd));
  }

  @Post("paye")
  computePaye(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: ComputeTaxDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.taxCalculation.computePayeReturn(user.organizationId, companyId, user.sub, new Date(dto.periodStart), new Date(dto.periodEnd));
  }

  @Post("wht")
  computeWht(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: ComputeTaxDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.taxCalculation.computeWhtReturn(user.organizationId, companyId, user.sub, new Date(dto.periodStart), new Date(dto.periodEnd));
  }
}

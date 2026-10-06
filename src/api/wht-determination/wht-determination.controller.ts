import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { WhtDeterminationService } from "./wht-determination.service";
import { RecordTransactionDto } from "./dto/record-transaction.dto";

@Controller("companies/:companyId/wht-transactions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WhtDeterminationController {
  constructor(private readonly wht: WhtDeterminationService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_TAX_HISTORY)
  list(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.wht.listForCompany(user.organizationId, companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CALCULATE_TAXES)
  record(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: RecordTransactionDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.wht.recordAndDetermine(
      user.organizationId,
      companyId,
      { ...dto, transactionDate: new Date(dto.transactionDate) },
      dto.supplierIsSmallCompany ?? false,
      new Date()
    );
  }
}

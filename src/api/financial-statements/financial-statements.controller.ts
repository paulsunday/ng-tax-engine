import { Controller, ForbiddenException, Get, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { FinancialStatementsService } from "./financial-statements.service";

@Controller("companies/:companyId/financial-statements")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
export class FinancialStatementsController {
  constructor(private readonly statements: FinancialStatementsService) {}

  @Get("trial-balance")
  trialBalance(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Query("asOfDate") asOfDate?: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.statements.getTrialBalance(user.organizationId, companyId, asOfDate ? new Date(asOfDate) : undefined);
  }

  @Get("profit-and-loss")
  profitAndLoss(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Query("periodStart") periodStart: string,
    @Query("periodEnd") periodEnd: string
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.statements.getProfitAndLoss(user.organizationId, companyId, new Date(periodStart), new Date(periodEnd));
  }

  @Get("balance-sheet")
  balanceSheet(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Query("asOfDate") asOfDate: string,
    @Query("periodStart") periodStart: string
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.statements.getBalanceSheet(user.organizationId, companyId, new Date(asOfDate), new Date(periodStart));
  }

  @Get("ar-aging")
  arAging(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Query("asOfDate") asOfDate?: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.statements.getArAging(user.organizationId, companyId, asOfDate ? new Date(asOfDate) : new Date());
  }

  @Get("ap-aging")
  apAging(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Query("asOfDate") asOfDate?: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.statements.getApAging(user.organizationId, companyId, asOfDate ? new Date(asOfDate) : new Date());
  }

  @Get("cash-movement")
  cashMovement(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Query("cashAccountId") cashAccountId: string,
    @Query("periodStart") periodStart: string,
    @Query("periodEnd") periodEnd: string
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.statements.getCashMovementSummary(user.organizationId, companyId, cashAccountId, new Date(periodStart), new Date(periodEnd));
  }
}

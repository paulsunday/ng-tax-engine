import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { ReconciliationService } from "./reconciliation.service";
import { StartReconciliationDto } from "./dto/start-reconciliation.dto";

@Controller("companies/:companyId/reconciliations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.RECONCILE_TRANSACTIONS)
  start(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: StartReconciliationDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.reconciliation.start(user.organizationId, companyId, user.sub, {
      bankAccountId: dto.bankAccountId,
      periodLabel: dto.periodLabel,
      statementEndDate: new Date(dto.statementEndDate),
      statementBalanceNgn: dto.statementBalanceNgn,
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
  list(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Query("bankAccountId") bankAccountId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.reconciliation.listForBankAccount(user.organizationId, companyId, bankAccountId);
  }

  @Get(":reconciliationId")
  @RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
  getSummary(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("reconciliationId") reconciliationId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.reconciliation.getSummary(user.organizationId, companyId, reconciliationId);
  }

  @Post(":reconciliationId/complete")
  @RequirePermissions(PERMISSIONS.RECONCILE_TRANSACTIONS)
  complete(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("reconciliationId") reconciliationId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.reconciliation.complete(user.organizationId, companyId, user.sub, reconciliationId);
  }
}

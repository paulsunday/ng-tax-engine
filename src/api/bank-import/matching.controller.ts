import { Body, Controller, ForbiddenException, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { MatchingService } from "./matching.service";

@Controller("companies/:companyId/bank-accounts/:bankAccountId")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Post("auto-match")
  @RequirePermissions(PERMISSIONS.RECONCILE_TRANSACTIONS)
  autoMatch(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("bankAccountId") bankAccountId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.matching.autoMatchAllUnmatched(user.organizationId, companyId, bankAccountId);
  }

  @Post("transactions/:bankTransactionId/match")
  @RequirePermissions(PERMISSIONS.RECONCILE_TRANSACTIONS)
  matchOne(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Param("bankTransactionId") bankTransactionId: string
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.matching.matchTransaction(user.organizationId, companyId, bankTransactionId);
  }

  @Post("transactions/:bankTransactionId/confirm-match")
  @RequirePermissions(PERMISSIONS.RECONCILE_TRANSACTIONS)
  confirmMatch(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Param("bankTransactionId") bankTransactionId: string,
    @Body("entityType") entityType: string,
    @Body("entityId") entityId: string
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.matching.confirmMatch(user.organizationId, companyId, user.sub, bankTransactionId, entityType, entityId);
  }

  @Post("transactions/:bankTransactionId/unmatch")
  @RequirePermissions(PERMISSIONS.RECONCILE_TRANSACTIONS)
  unmatch(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Param("bankTransactionId") bankTransactionId: string
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.matching.unmatch(user.organizationId, companyId, user.sub, bankTransactionId);
  }
}

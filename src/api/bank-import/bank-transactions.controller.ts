import { Controller, ForbiddenException, Get, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { BankImportService } from "./bank-import.service";

@Controller("companies/:companyId/bank-accounts/:bankAccountId/transactions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BankTransactionsController {
  constructor(private readonly bankImport: BankImportService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
  list(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("bankAccountId") bankAccountId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.bankImport.listTransactions(user.organizationId, companyId, bankAccountId);
  }
}

import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { PaymentsService } from "./payments.service";
import { RecordTaxPaymentDto } from "./dto/record-payment.dto";

@Controller("companies/:companyId/tax-returns/:taxReturnId/payments")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get("outstanding")
  @RequirePermissions(PERMISSIONS.VIEW_TAX_HISTORY)
  outstanding(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("taxReturnId") taxReturnId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.payments.getOutstandingBalance(user.organizationId, companyId, taxReturnId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CREATE_TRANSACTIONS)
  record(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Param("taxReturnId") taxReturnId: string,
    @Body() dto: RecordTaxPaymentDto
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.payments.recordPayment(user.organizationId, companyId, user.sub, taxReturnId, dto.amountNgn, dto.paymentReference);
  }

  @Post(":paymentId/confirm")
  @RequirePermissions(PERMISSIONS.APPROVE_TRANSACTIONS)
  confirm(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Param("paymentId") paymentId: string
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.payments.confirmPayment(user.organizationId, companyId, user.sub, paymentId);
  }
}

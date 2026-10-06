import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { ExpensesService } from "./expenses.service";
import { CreateExpenseDto } from "./dto/create-expense.dto";
import { RecordExpensePaymentDto } from "./dto/record-expense-payment.dto";

@Controller("companies/:companyId/expenses")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
  list(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.expenses.listForCompany(user.organizationId, companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CREATE_TRANSACTIONS)
  create(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: CreateExpenseDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.expenses.create(user.organizationId, companyId, user.sub, {
      supplierId: dto.supplierId,
      expenseDate: new Date(dto.expenseDate),
      description: dto.description,
      vatRate: dto.vatRate,
      items: dto.items,
    });
  }

  @Post(":expenseId/post")
  @RequirePermissions(PERMISSIONS.APPROVE_TRANSACTIONS)
  post(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("expenseId") expenseId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.expenses.post(user.organizationId, companyId, user.sub, expenseId);
  }

  @Post(":expenseId/payments")
  @RequirePermissions(PERMISSIONS.CREATE_TRANSACTIONS)
  recordPayment(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Param("expenseId") expenseId: string,
    @Body() dto: RecordExpensePaymentDto
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.expenses.recordPayment(
      user.organizationId,
      companyId,
      user.sub,
      expenseId,
      dto.amountNgn,
      new Date(dto.paymentDate),
      dto.method,
      dto.reference
    );
  }
}

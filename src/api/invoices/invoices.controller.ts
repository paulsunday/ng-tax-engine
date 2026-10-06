import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { InvoicesService } from "./invoices.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { RecordInvoicePaymentDto } from "./dto/record-payment.dto";

@Controller("companies/:companyId/invoices")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
  list(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.invoices.listForCompany(user.organizationId, companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CREATE_TRANSACTIONS)
  create(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: CreateInvoiceDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.invoices.create(user.organizationId, companyId, user.sub, {
      customerId: dto.customerId,
      invoiceNumber: dto.invoiceNumber,
      issueDate: new Date(dto.issueDate),
      dueDate: new Date(dto.dueDate),
      notes: dto.notes,
      items: dto.items,
    });
  }

  @Post(":invoiceId/post")
  @RequirePermissions(PERMISSIONS.APPROVE_TRANSACTIONS)
  post(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("invoiceId") invoiceId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.invoices.post(user.organizationId, companyId, user.sub, invoiceId);
  }

  @Post(":invoiceId/payments")
  @RequirePermissions(PERMISSIONS.CREATE_TRANSACTIONS)
  recordPayment(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Param("invoiceId") invoiceId: string,
    @Body() dto: RecordInvoicePaymentDto
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.invoices.recordPayment(
      user.organizationId,
      companyId,
      user.sub,
      invoiceId,
      dto.amountNgn,
      new Date(dto.paymentDate),
      dto.method,
      dto.reference
    );
  }
}

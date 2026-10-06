import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";

@Controller("companies/:companyId/customers")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
  list(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.customers.listForCompany(user.organizationId, companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CREATE_TRANSACTIONS)
  create(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: CreateCustomerDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.customers.create(user.organizationId, companyId, dto);
  }
}

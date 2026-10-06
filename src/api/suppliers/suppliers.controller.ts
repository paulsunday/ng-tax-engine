import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { SuppliersService } from "./suppliers.service";
import { CreateSupplierDto } from "./dto/create-supplier.dto";

@Controller("companies/:companyId/suppliers")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
  list(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.suppliers.listForCompany(user.organizationId, companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CREATE_TRANSACTIONS)
  create(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: CreateSupplierDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.suppliers.create(user.organizationId, companyId, dto);
  }
}

import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { PayrollService } from "./payroll.service";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { RunPayeDto } from "./dto/run-paye.dto";

@Controller("companies/:companyId/employees")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
  list(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.payroll.listEmployees(user.organizationId, companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MANAGE_COMPANY_SETTINGS)
  create(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: CreateEmployeeDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.payroll.createEmployee(user.organizationId, companyId, dto);
  }

  @Post(":employeeId/paye")
  @RequirePermissions(PERMISSIONS.CALCULATE_TAXES)
  runPaye(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("employeeId") employeeId: string, @Body() dto: RunPayeDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.payroll.runPayeForEmployee(user.organizationId, companyId, employeeId, dto, new Date());
  }
}

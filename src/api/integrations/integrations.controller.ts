import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { IntegrationConnection } from "@prisma/client";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { IntegrationsService } from "./integrations.service";
import { IntegrationKeyGuard, CurrentConnection } from "./integration-key.guard";
import { CreateConnectionDto } from "./dto/create-connection.dto";
import { SsoRequestDto } from "./dto/sso-request.dto";

/** Users of the company's organization create and revoke connection keys. */
@Controller("companies/:companyId/integrations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CompanyIntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MANAGE_COMPANY_SETTINGS)
  list(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.integrations.listForCompany(user.organizationId, companyId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.MANAGE_COMPANY_SETTINGS)
  create(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: CreateConnectionDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.integrations.create(user.organizationId, companyId, user.sub, dto.label);
  }

  @Post(":connectionId/revoke")
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.MANAGE_COMPANY_SETTINGS)
  revoke(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("connectionId") connectionId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.integrations.revoke(user.organizationId, companyId, user.sub, connectionId);
  }
}

/** The machine API an external system calls with its integration key. */
@Controller("integrations/v1")
@UseGuards(IntegrationKeyGuard)
export class IntegrationApiController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get("summary")
  summary(@CurrentConnection() connection: IntegrationConnection) {
    return this.integrations.summary(connection);
  }

  @Post("sso")
  @HttpCode(200)
  sso(@CurrentConnection() connection: IntegrationConnection, @Body() dto: SsoRequestDto) {
    return this.integrations.createSsoLink(connection, dto.email);
  }
}

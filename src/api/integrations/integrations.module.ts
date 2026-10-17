import { Module } from "@nestjs/common";
import { IntegrationsService } from "./integrations.service";
import { CompanyIntegrationsController, IntegrationApiController } from "./integrations.controller";
import { IntegrationKeyGuard } from "./integration-key.guard";
import { CompaniesModule } from "../companies/companies.module";
import { AuditLogModule } from "../audit-log/audit-log.module";

@Module({
  imports: [CompaniesModule, AuditLogModule],
  providers: [IntegrationsService, IntegrationKeyGuard],
  controllers: [CompanyIntegrationsController, IntegrationApiController],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}

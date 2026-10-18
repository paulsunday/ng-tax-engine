import { Module } from "@nestjs/common";
import { IntegrationsService } from "./integrations.service";
import { CompanyIntegrationsController, IntegrationApiController } from "./integrations.controller";
import { IntegrationKeyGuard } from "./integration-key.guard";
import { CompaniesModule } from "../companies/companies.module";
import { CustomersModule } from "../customers/customers.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { JournalModule } from "../journal/journal.module";
import { AuditLogModule } from "../audit-log/audit-log.module";

@Module({
  imports: [CompaniesModule, CustomersModule, InvoicesModule, JournalModule, AuditLogModule],
  providers: [IntegrationsService, IntegrationKeyGuard],
  controllers: [CompanyIntegrationsController, IntegrationApiController],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}

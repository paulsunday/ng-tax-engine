import { Module } from "@nestjs/common";
import { ComplianceCalendarService } from "./compliance-calendar.service";
import { ComplianceCalendarController } from "./compliance-calendar.controller";
import { CompaniesModule } from "../companies/companies.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { TaxRulesModule } from "../tax-rules/tax-rules.module";

@Module({
  imports: [CompaniesModule, AuditLogModule, TaxRulesModule],
  providers: [ComplianceCalendarService],
  controllers: [ComplianceCalendarController],
  exports: [ComplianceCalendarService],
})
export class ComplianceCalendarModule {}

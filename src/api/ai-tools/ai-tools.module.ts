import { Module } from "@nestjs/common";
import { AiToolsService } from "./ai-tools.service";
import { AiToolsController } from "./ai-tools.controller";
import { CompaniesModule } from "../companies/companies.module";
import { FinancialStatementsModule } from "../financial-statements/financial-statements.module";
import { ComplianceCalendarModule } from "../compliance-calendar/compliance-calendar.module";
import { TaxReturnsModule } from "../tax-returns/tax-returns.module";
import { TaxCalculationModule } from "../tax-calculation/tax-calculation.module";
import { AuditModule } from "../audit/audit.module";
import { ScenariosModule } from "../scenarios/scenarios.module";
import { FilingModule } from "../filing/filing.module";

@Module({
  imports: [
    CompaniesModule,
    FinancialStatementsModule,
    ComplianceCalendarModule,
    TaxReturnsModule,
    TaxCalculationModule,
    AuditModule,
    ScenariosModule,
    FilingModule,
  ],
  providers: [AiToolsService],
  controllers: [AiToolsController],
  exports: [AiToolsService],
})
export class AiToolsModule {}

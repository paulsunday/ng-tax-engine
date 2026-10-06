import { Module } from "@nestjs/common";
import { ScenariosService } from "./scenarios.service";
import { ScenariosController } from "./scenarios.controller";
import { CompaniesModule } from "../companies/companies.module";
import { FinancialStatementsModule } from "../financial-statements/financial-statements.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { TaxRulesModule } from "../tax-rules/tax-rules.module";

@Module({
  imports: [CompaniesModule, FinancialStatementsModule, AuditLogModule, TaxRulesModule],
  providers: [ScenariosService],
  controllers: [ScenariosController],
  exports: [ScenariosService],
})
export class ScenariosModule {}

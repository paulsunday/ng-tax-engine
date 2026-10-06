import { Module } from "@nestjs/common";
import { TaxCalculationService } from "./tax-calculation.service";
import { TaxCalculationController } from "./tax-calculation.controller";
import { CompaniesModule } from "../companies/companies.module";
import { FinancialStatementsModule } from "../financial-statements/financial-statements.module";
import { CapitalAllowanceModule } from "../capital-allowance/capital-allowance.module";
import { TaxLossModule } from "../tax-loss/tax-loss.module";
import { PayrollModule } from "../payroll/payroll.module";
import { WhtDeterminationModule } from "../wht-determination/wht-determination.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { TaxRulesModule } from "../tax-rules/tax-rules.module";

@Module({
  imports: [CompaniesModule, FinancialStatementsModule, CapitalAllowanceModule, TaxLossModule, PayrollModule, WhtDeterminationModule, AuditLogModule, TaxRulesModule],
  providers: [TaxCalculationService],
  controllers: [TaxCalculationController],
  exports: [TaxCalculationService],
})
export class TaxCalculationModule {}

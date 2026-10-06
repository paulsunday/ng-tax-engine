import { Module } from "@nestjs/common";
import { PayrollService } from "./payroll.service";
import { PayrollController } from "./payroll.controller";
import { CompaniesModule } from "../companies/companies.module";
import { TaxRulesModule } from "../tax-rules/tax-rules.module";

@Module({
  imports: [CompaniesModule, TaxRulesModule],
  providers: [PayrollService],
  controllers: [PayrollController],
  exports: [PayrollService],
})
export class PayrollModule {}

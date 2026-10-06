import { Module } from "@nestjs/common";
import { CapitalAllowanceService } from "./capital-allowance.service";
import { CapitalAllowanceController } from "./capital-allowance.controller";
import { CompaniesModule } from "../companies/companies.module";
import { TaxRulesModule } from "../tax-rules/tax-rules.module";

@Module({
  imports: [CompaniesModule, TaxRulesModule],
  providers: [CapitalAllowanceService],
  controllers: [CapitalAllowanceController],
  exports: [CapitalAllowanceService],
})
export class CapitalAllowanceModule {}

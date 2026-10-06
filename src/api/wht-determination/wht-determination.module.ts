import { Module } from "@nestjs/common";
import { WhtDeterminationService } from "./wht-determination.service";
import { WhtDeterminationController } from "./wht-determination.controller";
import { CompaniesModule } from "../companies/companies.module";
import { TaxRulesModule } from "../tax-rules/tax-rules.module";

@Module({
  imports: [CompaniesModule, TaxRulesModule],
  providers: [WhtDeterminationService],
  controllers: [WhtDeterminationController],
  exports: [WhtDeterminationService],
})
export class WhtDeterminationModule {}

import { Module } from "@nestjs/common";
import { TaxRuleGovernanceService } from "./tax-rule-governance.service";
import { TaxRuleGovernanceController } from "./tax-rule-governance.controller";
import { TaxRulesModule } from "../tax-rules/tax-rules.module";

@Module({
  imports: [TaxRulesModule],
  providers: [TaxRuleGovernanceService],
  controllers: [TaxRuleGovernanceController],
  exports: [TaxRuleGovernanceService],
})
export class TaxRuleGovernanceModule {}

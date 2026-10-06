import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RULE_REPOSITORY } from "./tax-rules.constants";
import { RuleRepository } from "../../rules/RuleRepository";

/**
 * Read-only endpoints the frontend uses to pre-fill rate fields (e.g. a new invoice's
 * default VAT rate) WITHOUT the accounting module ever hardcoding a tax figure itself.
 * If a rule isn't currently activatable, this reports that honestly rather than guessing
 * — the caller must then let the user enter the rate manually (brief §34/§38).
 */
@Controller("tax-rules")
@UseGuards(JwtAuthGuard)
export class TaxRulesController {
  constructor(@Inject(RULE_REPOSITORY) private readonly rules: RuleRepository) {}

  @Get("vat-rate")
  getCurrentVatRate() {
    const today = new Date().toISOString().slice(0, 10);
    const rule = this.rules.tryGetEffectiveRule<number>("vat_standard_rate", "VAT", "NG-FEDERAL", today);
    if (!rule) {
      return {
        available: false,
        rate: null,
        message: "Current VAT rate rule is not yet activatable (pending tax-professional approval). Enter the rate manually.",
      };
    }
    return {
      available: true,
      rate: rule.value,
      sourceDocument: rule.sourceDocument,
      sourceReference: rule.sourceReference,
      status: rule.status,
    };
  }
}

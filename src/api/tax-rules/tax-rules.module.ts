import { Module } from "@nestjs/common";
import { JsonRuleRepository } from "../../rules/JsonRuleRepository";
import { RuleRepository } from "../../rules/RuleRepository";
import { TaxRulesController } from "./tax-rules.controller";
import { RULE_REPOSITORY } from "./tax-rules.constants";

/**
 * Bridges the framework-agnostic tax rules engine (src/rules, src/engine — built in the
 * earlier phase of this project, see REGULATORY_RESEARCH_REPORT.md) into the NestJS app.
 *
 * Deliberately uses the PLAIN JsonRuleRepository here, NOT the demo-approval-promoted
 * version the test suite uses — this is real application code, so a DRAFT_VERIFIED rule
 * (source-confirmed but not yet signed off by a qualified tax professional, brief §38/§42)
 * correctly stays blocked until that approval actually happens. Replace with a
 * PrismaRuleRepository reading the admin-managed TaxRule/TaxRuleVersion tables once that
 * approval workflow UI exists (tracked as Phase 11/12) — nothing outside this module needs
 * to change when that happens, because everything else depends on the RuleRepository
 * interface, not on JsonRuleRepository specifically.
 */
@Module({
  providers: [{ provide: RULE_REPOSITORY, useFactory: () => new JsonRuleRepository() }],
  controllers: [TaxRulesController],
  exports: [RULE_REPOSITORY],
})
export class TaxRulesModule {}

export type { RuleRepository };

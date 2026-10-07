import { Logger, Module } from "@nestjs/common";
import { PrismaRuleRepository } from "../../rules/PrismaRuleRepository";
import { RuleRepository } from "../../rules/RuleRepository";
import { TaxRulesController } from "./tax-rules.controller";
import { RULE_REPOSITORY } from "./tax-rules.constants";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Bridges the framework-agnostic tax rules engine (src/rules, src/engine — built in the
 * earlier phase of this project, see REGULATORY_RESEARCH_REPORT.md) into the NestJS app.
 *
 * Uses PrismaRuleRepository — the real, admin-managed TaxRule/TaxRuleVersion tables,
 * written only by the tax-rule-governance API (src/api/tax-rule-governance) — NOT the
 * JsonRuleRepository the test suite uses. A rule is usable here only once it has actually
 * gone through the full DRAFT -> ... -> ACTIVE lifecycle via that API.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: RULE_REPOSITORY,
      useFactory: async (prisma: PrismaService) => {
        const repo = new PrismaRuleRepository(prisma);
        try {
          await repo.refresh();
        } catch (error) {
          // A transient DB hiccup at boot must not crash-loop the whole API — start with
          // an empty rule set (every calculation correctly reports PENDING_RULE_APPROVAL
          // until the next refresh succeeds) rather than refusing to boot at all.
          new Logger("TaxRulesModule").error(
            `Initial rule-repository load failed — starting with an empty rule set: ${(error as Error).message}`
          );
        }
        return repo;
      },
      inject: [PrismaService],
    },
  ],
  controllers: [TaxRulesController],
  exports: [RULE_REPOSITORY],
})
export class TaxRulesModule {}

export type { RuleRepository };

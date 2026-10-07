import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../common/rbac.constants";
import { TaxRuleGovernanceService } from "./tax-rule-governance.service";
import { CreateRuleDto } from "./dto/create-rule.dto";
import {
  ActivateRuleDto,
  ApproveRuleDto,
  RejectRuleDto,
  RequestRevisionDto,
  ResearchRuleDto,
  RetireRuleDto,
  SupersedeRuleDto,
  VerifyRuleDto,
} from "./dto/rule-action.dto";

/**
 * Tax-rule lifecycle governance — the only API that may move a rule toward ACTIVE
 * (production-readiness mandate §1). This is a cross-tenant, platform-level concern
 * (gated on JwtPayload.isPlatformAdmin / isTaxRuleApprover, not any organization's own
 * RBAC) — the same statutory CIT rate serves every tenant's calculations at once.
 */
@Controller("tax-rule-governance")
@UseGuards(JwtAuthGuard)
export class TaxRuleGovernanceController {
  constructor(private readonly governance: TaxRuleGovernanceService) {}

  @Get("rules/pending")
  listPending() {
    return this.governance.listPending();
  }

  @Get("rules")
  list(@Query("status") status?: string, @Query("taxType") taxType?: string, @Query("jurisdiction") jurisdiction?: string) {
    return this.governance.list({ status, taxType, jurisdiction });
  }

  @Get("rules/:ruleVersionId")
  getOne(@Param("ruleVersionId") ruleVersionId: string) {
    return this.governance.getOne(ruleVersionId);
  }

  @Get("rules/:ruleVersionId/sources")
  getSources(@Param("ruleVersionId") ruleVersionId: string) {
    return this.governance.getSources(ruleVersionId);
  }

  @Get("rules/:ruleVersionId/history")
  getHistory(@Param("ruleVersionId") ruleVersionId: string) {
    return this.governance.getHistory(ruleVersionId);
  }

  @Post("rules")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRuleDto) {
    return this.governance.create(user.sub, dto);
  }

  @Post("rules/:ruleVersionId/research")
  research(@CurrentUser() user: JwtPayload, @Param("ruleVersionId") ruleVersionId: string, @Body() dto: ResearchRuleDto) {
    return this.governance.research(user.sub, ruleVersionId, dto);
  }

  @Post("rules/:ruleVersionId/verify")
  verify(@CurrentUser() user: JwtPayload, @Param("ruleVersionId") ruleVersionId: string, @Body() dto: VerifyRuleDto) {
    return this.governance.verify(user.sub, ruleVersionId, dto);
  }

  @Post("rules/:ruleVersionId/submit-for-approval")
  submitForApproval(@CurrentUser() user: JwtPayload, @Param("ruleVersionId") ruleVersionId: string) {
    return this.governance.submitForApproval(user.sub, ruleVersionId);
  }

  @Post("rules/:ruleVersionId/approve")
  approve(@CurrentUser() user: JwtPayload, @Param("ruleVersionId") ruleVersionId: string, @Body() dto: ApproveRuleDto) {
    return this.governance.approve(user.sub, user.isPlatformAdmin, user.isTaxRuleApprover, ruleVersionId, dto);
  }

  @Post("rules/:ruleVersionId/reject")
  reject(@CurrentUser() user: JwtPayload, @Param("ruleVersionId") ruleVersionId: string, @Body() dto: RejectRuleDto) {
    return this.governance.reject(user.sub, user.isPlatformAdmin, user.isTaxRuleApprover, ruleVersionId, dto);
  }

  @Post("rules/:ruleVersionId/request-revision")
  requestRevision(@CurrentUser() user: JwtPayload, @Param("ruleVersionId") ruleVersionId: string, @Body() dto: RequestRevisionDto) {
    return this.governance.requestRevision(user.sub, user.isPlatformAdmin, user.isTaxRuleApprover, ruleVersionId, dto);
  }

  @Post("rules/:ruleVersionId/activate")
  activate(@CurrentUser() user: JwtPayload, @Param("ruleVersionId") ruleVersionId: string, @Body() dto: ActivateRuleDto) {
    return this.governance.activate(user.sub, user.isPlatformAdmin, user.isTaxRuleApprover, ruleVersionId, dto);
  }

  @Post("rules/:ruleVersionId/retire")
  retire(@CurrentUser() user: JwtPayload, @Param("ruleVersionId") ruleVersionId: string, @Body() dto: RetireRuleDto) {
    return this.governance.retire(user.sub, user.isPlatformAdmin, user.isTaxRuleApprover, ruleVersionId, dto);
  }

  @Post("rules/:ruleVersionId/supersede")
  supersede(@CurrentUser() user: JwtPayload, @Param("ruleVersionId") ruleVersionId: string, @Body() dto: SupersedeRuleDto) {
    return this.governance.supersede(user.sub, ruleVersionId, dto);
  }
}

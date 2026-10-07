import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, isActive: true, isPlatformAdmin: true, isTaxRuleApprover: true, createdAt: true },
    });
    if (!user) throw new NotFoundException("User not found.");
    return user;
  }

  /**
   * Cross-tenant, platform-admin-only — granting the authority to approve/activate a
   * statutory tax rule is deliberately not something any organization's own admin can do
   * for themselves (production-readiness mandate §1: "Only authorised users with the
   * appropriate tax administration role"). Every grant/revoke is audit-logged.
   */
  async setTaxRuleApprover(actingUserId: string, actingUserIsPlatformAdmin: boolean, targetUserId: string, grant: boolean) {
    if (!actingUserIsPlatformAdmin) {
      throw new ForbiddenException("Only a platform administrator may grant or revoke tax-rule-approver status.");
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException("User not found.");

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isTaxRuleApprover: grant },
      select: { id: true, email: true, isTaxRuleApprover: true },
    });

    await this.auditLog.record({
      organizationId: null,
      userId: actingUserId,
      action: grant ? "GRANT_TAX_RULE_APPROVER" : "REVOKE_TAX_RULE_APPROVER",
      objectType: "User",
      objectId: targetUserId,
      previousValue: { isTaxRuleApprover: target.isTaxRuleApprover },
      newValue: { isTaxRuleApprover: grant },
    });

    return updated;
  }
}

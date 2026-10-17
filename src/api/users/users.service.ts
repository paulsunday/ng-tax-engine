import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { OrganizationsService } from "../organizations/organizations.service";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly organizations: OrganizationsService
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
   * NDPA/NDPR right of access (mandate follow-up, see docs/NDPR_GAP_ANALYSIS.md §8).
   * Scope is deliberately narrow: this exports the PLATFORM USER's own personal data —
   * their profile, org memberships, and their own audit-log history. It does NOT export
   * an organization's business records (Employees/Customers/Suppliers/transactions) —
   * those are data an organization controls about third parties, so a request about that
   * data belongs to the organization (the data controller) under NDPA, not to a
   * self-service export off this user's own account. Never includes passwordHash or
   * mfaSecret — those are not "your data" in the exportable sense, they're credentials.
   */
  async exportMyData(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, isActive: true, mfaEnabled: true, isPlatformAdmin: true, isTaxRuleApprover: true, createdAt: true },
    });
    const memberships = await this.prisma.organizationUser.findMany({
      where: { userId },
      include: { organization: { select: { id: true, name: true } }, role: { select: { name: true } } },
    });
    const auditLogEntries = await this.prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, organizationId: true, action: true, objectType: true, objectId: true, createdAt: true },
    });
    // Invitations are personal data about this user too — both ones they sent (as an
    // inviter) and ones addressed to them (as an invitee) — never another organization's
    // unrelated invitations.
    const invitations = await this.organizations.listInvitationsForExport(userId);

    return {
      exportedAt: new Date().toISOString(),
      profile: user,
      organizationMemberships: memberships.map((m) => ({
        organizationId: m.organization.id,
        organizationName: m.organization.name,
        roleName: m.role.name,
        status: m.status,
        joinedAt: m.joinedAt,
      })),
      auditLogHistory: auditLogEntries,
      invitationsSent: invitations.sent,
      invitationsReceived: invitations.received,
    };
  }

  /**
   * NDPA/NDPR right to erasure (mandate follow-up, see
   * docs/DATA_RETENTION_AND_ERASURE_POLICY.md). Anonymize-in-place, never a hard delete:
   * AuditLog rows referencing this user, and OrganizationUser membership history, must
   * survive (audit immutability + statutory retention both require this) — only this
   * user's OWN personally-identifying fields are scrubbed, and the account is deactivated
   * so it can never be logged into again (isActive=false already blocks login in
   * AuthService.login). Idempotent — erasing an already-erased account is a no-op-ish
   * re-confirmation, not an error, since a repeated request shouldn't fail.
   */
  async requestErasure(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.erasedAt) return { erasedAt: user.erasedAt, alreadyErased: true };

    const erasedAt = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: "[ERASED USER]",
        email: `erased-${userId}@erased.invalid`,
        passwordHash: "ERASED",
        mfaSecret: null,
        mfaEnabled: false,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        isActive: false,
        erasedAt,
      },
    });
    await this.organizations.revokeInvitationsSentBy(userId);

    await this.auditLog.record({
      organizationId: null,
      userId,
      action: "ERASURE_REQUESTED",
      objectType: "User",
      objectId: userId,
    });

    return { erasedAt, alreadyErased: false };
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

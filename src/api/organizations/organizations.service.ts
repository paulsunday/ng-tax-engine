import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { EmailService } from "../email/email.service";
import { ROLES } from "../common/rbac.constants";

const BCRYPT_ROUNDS = 12;
const INVITE_TTL_MS = Number(process.env.INVITE_TTL_HOURS ?? 168) * 60 * 60 * 1000; // 7 days
const MAX_PENDING_INVITATIONS_PER_ORG = 100;
const INVITE_RATE_LIMIT_PER_HOUR = 20; // invitation emails (new invites + resends) per organization and per inviter
const RESENDS_PER_INVITATION_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;

export interface AddMemberInput {
  email: string;
  fullName: string;
  temporaryPassword: string;
  roleName: string;
}

export interface InviteMemberInput {
  email: string;
  fullName: string;
  roleName: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** "jo**@example.com" — enough to confirm "yes, that's the address" without re-displaying it in full on a page a screenshot could leak. */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
}

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly email: EmailService
  ) {}

  async getById(organizationId: string) {
    return this.prisma.organization.findUnique({ where: { id: organizationId } });
  }

  /**
   * Unified member list: an INVITED row IS a member here (just one without access yet),
   * carrying its live invitation's invitedAt/inviteExpiresAt/invitedByName alongside —
   * matches the Team page's single table of name/email/role/status/date.
   */
  async listMembers(organizationId: string) {
    const [memberships, liveInvitations] = await Promise.all([
      this.prisma.organizationUser.findMany({
        where: { organizationId },
        include: { user: { select: { id: true, email: true, fullName: true, isActive: true } }, role: { select: { name: true } } },
        orderBy: { joinedAt: "asc" },
      }),
      this.prisma.organizationInvitation.findMany({
        where: { organizationId, acceptedAt: null, revokedAt: null },
        include: { invitedBy: { select: { fullName: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Only the MOST RECENT live invitation per membership matters for display — the
    // partial unique index guarantees there's at most one un-accepted/un-revoked row per
    // membership anyway, but this keeps the lookup correct even if that ever changes.
    const invitationByMembershipId = new Map<string, (typeof liveInvitations)[number]>();
    for (const inv of liveInvitations) {
      if (!invitationByMembershipId.has(inv.membershipId)) invitationByMembershipId.set(inv.membershipId, inv);
    }

    const now = new Date();
    return {
      members: memberships.map((m) => {
        const invitation = invitationByMembershipId.get(m.id);
        return {
          membershipId: m.id,
          email: m.user.email,
          fullName: m.user.fullName,
          roleName: m.role.name,
          status: m.status,
          joinedAt: m.status === "ACTIVE" ? m.joinedAt : null,
          invitationId: invitation?.id ?? null,
          invitedAt: invitation?.createdAt ?? null,
          inviteExpiresAt: invitation?.expiresAt ?? null,
          isInviteExpired: invitation ? invitation.expiresAt < now : false,
          invitedByName: invitation?.invitedBy.fullName ?? null,
        };
      }),
    };
  }

  /**
   * @deprecated Superseded by inviteMember()/acceptInvitation() (the email-invite flow).
   * Kept only for backward compatibility with any existing caller — the inviter sets a
   * temporary password directly and the membership is born ACTIVE immediately, with no
   * invite-acceptance step. Do not call this from new code (the frontend no longer does).
   */
  async addMember(organizationId: string, actingUserId: string, input: AddMemberInput) {
    const role = await this.prisma.role.findUnique({ where: { name: input.roleName } });
    if (!role) throw new BadRequestException(`Unknown role "${input.roleName}".`);
    if (role.name === ROLES.PLATFORM_ADMIN) throw new ForbiddenException("PLATFORM_ADMIN is not an organization role.");

    let user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (user) {
      const existingMembership = await this.prisma.organizationUser.findUnique({
        where: { organizationId_userId: { organizationId, userId: user.id } },
      });
      if (existingMembership) throw new ConflictException("User is already a member of this organization.");
    } else {
      user = await this.prisma.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          passwordHash: await bcrypt.hash(input.temporaryPassword, BCRYPT_ROUNDS),
        },
      });
    }

    const membership = await this.prisma.organizationUser.create({
      data: { organizationId, userId: user.id, roleId: role.id },
    });

    await this.auditLog.record({
      organizationId,
      userId: actingUserId,
      action: "CREATE",
      objectType: "OrganizationUser",
      objectId: membership.id,
      newValue: { addedUserId: user.id, email: user.email, role: role.name },
    });

    return membership;
  }

  /**
   * Invites a person by email. Creates the User (with an unusable random password, never
   * sent anywhere) if they don't already exist, puts an OrganizationUser in INVITED status,
   * and emails a single-use accept link. If email isn't configured/fails, the plaintext
   * accept URL is returned to the INVITER ONLY (never persisted) — same honest fallback
   * AuthService.requestPasswordReset already uses.
   */
  async inviteMember(organizationId: string, actingUserId: string, actingIsPlatformAdmin: boolean, input: InviteMemberInput) {
    this.assertEmailDeliveryConfigured();
    const email = normalizeEmail(input.email);
    const role = await this.prisma.role.findUnique({ where: { name: input.roleName } });
    if (!role) throw new BadRequestException(`Unknown role "${input.roleName}".`);

    await this.assertCanGrantRole(this.prisma, organizationId, actingUserId, actingIsPlatformAdmin, role);

    const existingUser = await this.prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
    if (existingUser?.erasedAt) throw new BadRequestException("This email belongs to an erased account and cannot be invited.");
    if (existingUser && !existingUser.isActive) throw new BadRequestException("This email belongs to a deactivated account and cannot be invited.");

    await this.assertWithinRateLimits(organizationId, actingUserId);

    let plaintextToken = "";
    const result = await this.prisma.$transaction(async (tx) => {
      let user = existingUser;
      let membership = user
        ? await tx.organizationUser.findUnique({ where: { organizationId_userId: { organizationId, userId: user.id } } })
        : null;

      if (membership?.status === "ACTIVE") {
        throw new ConflictException("This person is already an active member of this organization.");
      }
      if (membership?.status === "INVITED") {
        const live = await tx.organizationInvitation.findFirst({
          where: { membershipId: membership.id, acceptedAt: null, revokedAt: null },
        });
        if (live) throw new ConflictException("An invitation is already pending for this person — use resend instead.");
      }

      if (!user) {
        const unusablePasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), BCRYPT_ROUNDS);
        user = await tx.user.create({ data: { email, fullName: input.fullName, passwordHash: unusablePasswordHash, passwordSet: false } });
      }

      if (membership) {
        // DISABLED -> re-invited back to INVITED, with whatever role this new invite grants.
        membership = await tx.organizationUser.update({ where: { id: membership.id }, data: { status: "INVITED", roleId: role.id } });
      } else {
        membership = await tx.organizationUser.create({ data: { organizationId, userId: user.id, roleId: role.id, status: "INVITED" } });
      }

      plaintextToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(plaintextToken).digest("hex");
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

      const invitation = await tx.organizationInvitation.create({
        data: { organizationId, membershipId: membership.id, email, roleId: role.id, invitedByUserId: actingUserId, tokenHash, expiresAt },
      });

      return { invitation, userId: user.id };
    }).catch((error: unknown) => {
      // A simultaneous invite for the same person won the race (unique email, membership
      // or one-live-invitation index): report it as the conflict it is, not a 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("An invitation for this person was just created — refresh the list.");
      }
      throw error;
    });

    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const { sent, acceptUrl } = await this.sendInvitationEmail(email, organization.name, plaintextToken);

    await this.auditLog.record({
      organizationId,
      userId: actingUserId,
      action: "INVITE_MEMBER",
      objectType: "OrganizationInvitation",
      objectId: result.invitation.id,
      newValue: { invitedUserId: result.userId, email, roleName: role.name, emailSent: sent },
    });
    this.logger.log(`Invitation sent: org=${organizationId} invitation=${result.invitation.id} emailSent=${sent}`);

    return { invitationId: result.invitation.id, membershipId: result.invitation.membershipId, email, acceptUrl: sent ? null : acceptUrl };
  }

  async resendInvitation(organizationId: string, actingUserId: string, invitationId: string) {
    this.assertEmailDeliveryConfigured();
    const invitation = await this.prisma.organizationInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation || invitation.organizationId !== organizationId) throw new NotFoundException("Invitation not found.");
    if (invitation.acceptedAt || invitation.revokedAt) {
      throw new BadRequestException("This invitation is no longer pending — send a new invite instead.");
    }

    await this.assertWithinRateLimits(organizationId, actingUserId);
    const recentResends = await this.prisma.auditLog.count({
      where: { organizationId, objectId: invitationId, action: "RESEND_INVITATION", createdAt: { gte: new Date(Date.now() - HOUR_MS) } },
    });
    if (recentResends >= RESENDS_PER_INVITATION_PER_HOUR) {
      throw new BadRequestException("This invitation has been resent too many times in the last hour — try again later.");
    }

    const plaintextToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(plaintextToken).digest("hex");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const updated = await this.prisma.organizationInvitation.update({ where: { id: invitationId }, data: { tokenHash, expiresAt } });

    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    const { sent, acceptUrl } = await this.sendInvitationEmail(invitation.email, organization.name, plaintextToken);

    await this.auditLog.record({
      organizationId,
      userId: actingUserId,
      action: "RESEND_INVITATION",
      objectType: "OrganizationInvitation",
      objectId: invitationId,
      newValue: { emailSent: sent },
    });
    this.logger.log(`Invitation resent: org=${organizationId} invitation=${invitationId} emailSent=${sent}`);

    return { invitationId: updated.id, email: invitation.email, acceptUrl: sent ? null : acceptUrl };
  }

  async revokeInvitation(organizationId: string, actingUserId: string, invitationId: string) {
    const invitation = await this.prisma.organizationInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation || invitation.organizationId !== organizationId) throw new NotFoundException("Invitation not found.");
    if (invitation.acceptedAt || invitation.revokedAt) throw new BadRequestException("This invitation is no longer pending.");

    const [updatedInvitation] = await this.prisma.$transaction([
      this.prisma.organizationInvitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } }),
      this.prisma.organizationUser.updateMany({ where: { id: invitation.membershipId, status: "INVITED" }, data: { status: "DISABLED" } }),
    ]);

    await this.auditLog.record({
      organizationId,
      userId: actingUserId,
      action: "REVOKE_INVITATION",
      objectType: "OrganizationInvitation",
      objectId: invitationId,
      previousValue: { status: "INVITED" },
      newValue: { status: "DISABLED" },
    });

    return updatedInvitation;
  }

  /**
   * Both privilege-escalation rules live here in one place: (1) you cannot grant a role
   * whose permission set isn't a subset of your own (platform admins exempt, same as
   * PermissionsGuard), and (2) COMPANY_OWNER specifically can only be granted by an
   * existing COMPANY_OWNER — needed because COMPANY_ADMIN has the SAME permission set as
   * COMPANY_OWNER today (see DEFAULT_ROLE_PERMISSIONS), so rule (1) alone would let a
   * COMPANY_ADMIN hand out COMPANY_OWNER.
   */
  private async assertCanGrantRole(
    tx: Prisma.TransactionClient | PrismaService,
    organizationId: string,
    actingUserId: string,
    actingIsPlatformAdmin: boolean,
    targetRole: { id: string; name: string }
  ): Promise<void> {
    if (targetRole.name === ROLES.PLATFORM_ADMIN) {
      throw new ForbiddenException("PLATFORM_ADMIN is not an organization role.");
    }
    if (actingIsPlatformAdmin) return;

    const actingMembership = await tx.organizationUser.findFirst({
      where: { organizationId, userId: actingUserId, status: "ACTIVE" },
      include: { role: true },
    });
    if (!actingMembership) throw new ForbiddenException("You are not an active member of this organization.");

    if (targetRole.name === ROLES.COMPANY_OWNER && actingMembership.role.name !== ROLES.COMPANY_OWNER) {
      throw new ForbiddenException("Only a company owner can grant the company owner role.");
    }

    const [actingPermissions, targetPermissions] = await Promise.all([
      this.permissionKeysForRole(tx, actingMembership.roleId),
      this.permissionKeysForRole(tx, targetRole.id),
    ]);
    const missing = [...targetPermissions].filter((p) => !actingPermissions.has(p));
    if (missing.length > 0) {
      throw new ForbiddenException("You cannot grant a role with permissions you do not have yourself.");
    }
  }

  private async permissionKeysForRole(tx: Prisma.TransactionClient | PrismaService, roleId: string): Promise<Set<string>> {
    const rows = await tx.rolePermission.findMany({ where: { roleId }, select: { permission: { select: { key: true } } } });
    return new Set(rows.map((r) => r.permission.key));
  }

  private async assertWithinRateLimits(organizationId: string, actingUserId: string): Promise<void> {
    const since = new Date(Date.now() - HOUR_MS);
    // Every invitation email counts: new invitations by their row, resends by their audit
    // entry (a resend reuses the row, so counting rows alone let resends go unlimited).
    const [orgInvites, inviterInvites, orgResends, inviterResends, pendingCount] = await Promise.all([
      this.prisma.organizationInvitation.count({ where: { organizationId, createdAt: { gte: since } } }),
      this.prisma.organizationInvitation.count({ where: { organizationId, invitedByUserId: actingUserId, createdAt: { gte: since } } }),
      this.prisma.auditLog.count({ where: { organizationId, action: "RESEND_INVITATION", createdAt: { gte: since } } }),
      this.prisma.auditLog.count({ where: { organizationId, userId: actingUserId, action: "RESEND_INVITATION", createdAt: { gte: since } } }),
      this.prisma.organizationInvitation.count({ where: { organizationId, acceptedAt: null, revokedAt: null } }),
    ]);
    const orgCount = orgInvites + orgResends;
    const inviterCount = inviterInvites + inviterResends;
    if (orgCount >= INVITE_RATE_LIMIT_PER_HOUR) {
      throw new BadRequestException("This organization has sent too many invitations in the last hour — try again later.");
    }
    if (inviterCount >= INVITE_RATE_LIMIT_PER_HOUR) {
      throw new BadRequestException("You have sent too many invitations in the last hour — try again later.");
    }
    if (pendingCount >= MAX_PENDING_INVITATIONS_PER_ORG) {
      throw new BadRequestException(`This organization has reached the maximum of ${MAX_PENDING_INVITATIONS_PER_ORG} pending invitations.`);
    }
  }

  /** Hard precondition, checked BEFORE any row is written: in production, an invitation
   * whose accept link can never resolve is worse than refusing outright (spec: "refuse to
   * send, and say so clearly"), so this throws rather than silently degrading like the
   * best-effort email-provider fallback below does. */
  private assertEmailDeliveryConfigured(): void {
    if (process.env.NODE_ENV === "production" && !process.env.FRONTEND_URL) {
      throw new BadRequestException(
        "FRONTEND_URL is not configured on the server — invitations cannot be sent until an administrator sets it."
      );
    }
  }

  private async sendInvitationEmail(email: string, organizationName: string, token: string): Promise<{ sent: boolean; acceptUrl: string }> {
    const acceptUrl = `${process.env.FRONTEND_URL ?? ""}/accept-invite#token=${token}`;

    // Escaped: organizationName is user-supplied (set at registration) and goes into an
    // email body — strip characters that have no business in a plain-text invite line.
    const safeOrgName = organizationName.replace(/[\r\n]/g, " ");
    const { sent } = await this.email.send({
      to: email,
      subject: `You've been invited to join ${safeOrgName} on Netwave Books`,
      text:
        `You've been invited to join "${safeOrgName}" on Netwave Books.\n\n` +
        `Accept the invitation here (expires in ${Math.round(INVITE_TTL_MS / HOUR_MS)} hours):\n${acceptUrl}\n\n` +
        `If you weren't expecting this, you can ignore this email.`,
    });

    if (!sent) {
      this.logger.warn(`Invitation email not sent (no provider configured or send failed) for ${maskEmail(email)} — deliver the accept link manually if needed.`);
    }
    return { sent, acceptUrl };
  }

  async changeMemberRole(organizationId: string, actingUserId: string, actingIsPlatformAdmin: boolean, membershipId: string, newRoleName: string) {
    const newRole = await this.prisma.role.findUnique({ where: { name: newRoleName } });
    if (!newRole) throw new BadRequestException(`Unknown role "${newRoleName}".`);

    const updated = await this.prisma.$transaction(
      async (tx) => {
        const membership = await tx.organizationUser.findUnique({ where: { id: membershipId }, include: { role: true } });
        if (!membership || membership.organizationId !== organizationId) throw new NotFoundException("Membership not found.");
        if (membership.userId === actingUserId) throw new ForbiddenException("You cannot change your own role.");

        await this.assertCanGrantRole(tx, organizationId, actingUserId, actingIsPlatformAdmin, newRole);

        const wasOwner = membership.role.name === ROLES.COMPANY_OWNER;
        const staysOwner = newRole.name === ROLES.COMPANY_OWNER;
        if (wasOwner && !staysOwner) {
          if (!actingIsPlatformAdmin) {
            const actingMembership = await tx.organizationUser.findFirst({
              where: { organizationId, userId: actingUserId, status: "ACTIVE" },
              include: { role: true },
            });
            if (!actingMembership || actingMembership.role.name !== ROLES.COMPANY_OWNER) {
              throw new ForbiddenException("Only a company owner can remove the company owner role from someone.");
            }
          }
          if (membership.status === "ACTIVE") {
            const otherActiveOwners = await tx.organizationUser.count({
              where: { organizationId, status: "ACTIVE", role: { name: ROLES.COMPANY_OWNER }, id: { not: membership.id } },
            });
            if (otherActiveOwners === 0) throw new BadRequestException("Cannot downgrade the organization's only active company owner.");
          }
        }

        const result = await tx.organizationUser.update({ where: { id: membershipId }, data: { roleId: newRole.id }, include: { role: true, user: true } });
        return { result, previousRoleName: membership.role.name };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    await this.auditLog.record({
      organizationId,
      userId: actingUserId,
      action: "CHANGE_MEMBER_ROLE",
      objectType: "OrganizationUser",
      objectId: membershipId,
      previousValue: { roleName: updated.previousRoleName },
      newValue: { roleName: updated.result.role.name },
    });

    return updated.result;
  }

  async disableMember(organizationId: string, actingUserId: string, actingIsPlatformAdmin: boolean, membershipId: string) {
    const updated = await this.prisma.$transaction(
      async (tx) => {
        const membership = await tx.organizationUser.findUnique({ where: { id: membershipId }, include: { role: true } });
        if (!membership || membership.organizationId !== organizationId) throw new NotFoundException("Membership not found.");
        if (membership.userId === actingUserId) throw new ForbiddenException("You cannot disable yourself.");
        if (membership.status !== "ACTIVE") throw new BadRequestException(`Cannot disable a membership with status "${membership.status}".`);

        if (membership.role.name === ROLES.COMPANY_OWNER && !actingIsPlatformAdmin) {
          const actingMembership = await tx.organizationUser.findFirst({
            where: { organizationId, userId: actingUserId, status: "ACTIVE" },
            include: { role: true },
          });
          if (!actingMembership || actingMembership.role.name !== ROLES.COMPANY_OWNER) {
            throw new ForbiddenException("Only a company owner can disable another company owner.");
          }
        }

        if (membership.role.name === ROLES.COMPANY_OWNER) {
          const otherActiveOwners = await tx.organizationUser.count({
            where: { organizationId, status: "ACTIVE", role: { name: ROLES.COMPANY_OWNER }, id: { not: membership.id } },
          });
          if (otherActiveOwners === 0) throw new BadRequestException("Cannot disable the organization's only active company owner.");
        }

        return tx.organizationUser.update({ where: { id: membershipId }, data: { status: "DISABLED" }, include: { role: true, user: true } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    await this.auditLog.record({
      organizationId,
      userId: actingUserId,
      action: "DISABLE_MEMBER",
      objectType: "OrganizationUser",
      objectId: membershipId,
      previousValue: { status: "ACTIVE" },
      newValue: { status: "DISABLED" },
    });

    return updated;
  }

  /**
   * Re-enabling restores the membership's role, so it follows the same rules as granting
   * that role (only an owner restores an owner; no role beyond your own). A membership
   * that came from an invitation nobody ever accepted (invite -> revoke) can't be enabled:
   * that would make someone a member without their consent. Send a new invitation instead.
   */
  async enableMember(organizationId: string, actingUserId: string, actingIsPlatformAdmin: boolean, membershipId: string) {
    const updated = await this.prisma.$transaction(
      async (tx) => {
        const membership = await tx.organizationUser.findUnique({ where: { id: membershipId }, include: { role: true } });
        if (!membership || membership.organizationId !== organizationId) throw new NotFoundException("Membership not found.");
        if (membership.status !== "DISABLED") throw new BadRequestException(`Cannot enable a membership with status "${membership.status}".`);

        const [invitations, accepted] = await Promise.all([
          tx.organizationInvitation.count({ where: { membershipId } }),
          tx.organizationInvitation.count({ where: { membershipId, acceptedAt: { not: null } } }),
        ]);
        if (invitations > 0 && accepted === 0) {
          throw new BadRequestException("This person never accepted their invitation — send them a new invitation instead.");
        }

        await this.assertCanGrantRole(tx, organizationId, actingUserId, actingIsPlatformAdmin, membership.role);

        return tx.organizationUser.update({ where: { id: membershipId }, data: { status: "ACTIVE" }, include: { role: true, user: true } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    await this.auditLog.record({
      organizationId,
      userId: actingUserId,
      action: "ENABLE_MEMBER",
      objectType: "OrganizationUser",
      objectId: membershipId,
      previousValue: { status: "DISABLED" },
      newValue: { status: "ACTIVE" },
    });

    return updated;
  }

  /** Called from UsersService.requestErasure — an erased user's own pending invitations (sent BY them) are revoked, never left dangling. */
  async revokeInvitationsSentBy(userId: string): Promise<number> {
    const result = await this.prisma.organizationInvitation.updateMany({
      where: { invitedByUserId: userId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  /** NDPA export (UsersService.exportMyData): the user's own invitations, both sent and received — personal data about them, never another organization's secrets. */
  async listInvitationsForExport(userId: string) {
    const [sent, received] = await Promise.all([
      this.prisma.organizationInvitation.findMany({
        where: { invitedByUserId: userId },
        select: { id: true, organizationId: true, email: true, createdAt: true, acceptedAt: true, revokedAt: true, expiresAt: true },
      }),
      this.prisma.organizationInvitation.findMany({
        where: { membership: { userId } },
        select: { id: true, organizationId: true, createdAt: true, acceptedAt: true, revokedAt: true, expiresAt: true },
      }),
    ]);
    return { sent, received };
  }
}

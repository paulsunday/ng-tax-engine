import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { JwtPayload, ROLES } from "../common/rbac.constants";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { MfaService } from "./mfa.service";

const BCRYPT_ROUNDS = 12;
const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auditLog: AuditLogService,
    private readonly mfa: MfaService
  ) {}

  /**
   * Self-service signup creates a BRAND NEW organization (tenant) with the registering
   * user as COMPANY_OWNER — the standard "sign up creates your own workspace" SaaS flow.
   * Platform Administrator accounts are provisioned separately (seed/ops action), never
   * through this public endpoint.
   */
  async register(dto: RegisterDto): Promise<{ accessToken: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException("An account with this email already exists.");

    const ownerRole = await this.prisma.role.findUnique({ where: { name: ROLES.COMPANY_OWNER } });
    if (!ownerRole) {
      throw new Error(
        `Role "${ROLES.COMPANY_OWNER}" not found — run the RBAC seed script (prisma/seed-rbac.ts) before accepting registrations.`
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const { user, organization, membership } = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: { name: dto.organizationName } });
      const user = await tx.user.create({
        data: { email: dto.email, passwordHash, fullName: dto.fullName },
      });
      const membership = await tx.organizationUser.create({
        data: { organizationId: organization.id, userId: user.id, roleId: ownerRole.id },
      });
      return { user, organization, membership };
    });

    await this.auditLog.record({
      organizationId: organization.id,
      userId: user.id,
      action: "CREATE",
      objectType: "Organization",
      objectId: organization.id,
      newValue: { name: organization.name, ownerUserId: user.id },
      reason: "Self-service registration",
    });

    return {
      accessToken: this.signToken(user.id, user.email, organization.id, ownerRole.id, ownerRole.name, false, false),
    };
  }

  /**
   * Issues a token scoped to a specific org ONLY when there is exactly one active
   * membership to choose from — that is "the only option," not "the first of several
   * silently guessed" (mandate §10: remove the behaviour where a multi-org user is
   * automatically placed into the first membership). With 2+ active memberships, the
   * returned token deliberately carries organizationId=null (every org-scoped endpoint
   * already rejects that — TenantGuard/CompaniesService/AiToolsService all do this today)
   * and the caller must call switchOrganization to get a token actually usable for
   * company data.
   */
  async login(dto: LoginDto): Promise<{ accessToken: string; requiresOrganizationSelection: boolean; organizations: { organizationId: string; organizationName: string; roleName: string }[] }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) throw new UnauthorizedException("Invalid credentials.");

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) throw new UnauthorizedException("Invalid credentials.");

    if (user.mfaEnabled) {
      if (!user.mfaSecret) {
        throw new UnauthorizedException("MFA is enabled but no secret is provisioned — contact an administrator.");
      }
      if (!dto.totpCode) throw new UnauthorizedException("MFA code required.");
      if (!this.mfa.verify(dto.totpCode, user.mfaSecret)) throw new UnauthorizedException("Invalid MFA code.");
    }

    const memberships = await this.prisma.organizationUser.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      include: { role: true, organization: true },
    });

    if (memberships.length === 0 && !user.isPlatformAdmin) {
      throw new UnauthorizedException("User has no active organization membership.");
    }

    await this.auditLog.record({
      organizationId: memberships.length === 1 ? memberships[0].organizationId : null,
      userId: user.id,
      action: "LOGIN",
      objectType: "User",
      objectId: user.id,
    });

    const soleMembership = memberships.length === 1 ? memberships[0] : null;
    return {
      accessToken: this.signToken(
        user.id,
        user.email,
        soleMembership?.organizationId ?? null,
        soleMembership?.roleId ?? null,
        soleMembership?.role.name ?? null,
        user.isPlatformAdmin,
        user.isTaxRuleApprover
      ),
      requiresOrganizationSelection: memberships.length > 1,
      organizations: memberships.map((m) => ({ organizationId: m.organizationId, organizationName: m.organization.name, roleName: m.role.name })),
    };
  }

  /** The organisation switcher (mandate §10) — the active organisation is always explicit, re-issued as a brand-new token, never inferred. Callable whether the caller currently has an org selected or not. */
  async switchOrganization(userId: string, targetOrganizationId: string): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const membership = await this.prisma.organizationUser.findFirst({
      where: { userId, organizationId: targetOrganizationId, status: "ACTIVE" },
      include: { role: true },
    });

    if (!membership) {
      // Same error regardless of whether the org exists at all — never confirm/deny
      // existence of an organisation the caller isn't a member of (brief §4 IDOR principle).
      throw new ForbiddenException("No active membership in that organization.");
    }

    await this.auditLog.record({
      organizationId: targetOrganizationId,
      userId,
      action: "SWITCH_ORGANIZATION",
      objectType: "User",
      objectId: userId,
    });

    return {
      accessToken: this.signToken(user.id, user.email, membership.organizationId, membership.roleId, membership.role.name, user.isPlatformAdmin, user.isTaxRuleApprover),
    };
  }

  async listMyMemberships(userId: string) {
    const memberships = await this.prisma.organizationUser.findMany({
      where: { userId, status: "ACTIVE" },
      include: { role: true, organization: true },
    });
    return memberships.map((m) => ({ organizationId: m.organizationId, organizationName: m.organization.name, roleName: m.role.name }));
  }

  /**
   * Generates a new TOTP secret and stores it un-enabled (brief §41: MFA for sensitive
   * roles). mfaEnabled only flips to true once the user proves possession via
   * confirmMfaSetup — otherwise a user who never finishes setup would be silently
   * unprotected while believing a secret already exists.
   */
  async beginMfaSetup(userId: string): Promise<{ secret: string; otpauthUri: string; qrCodeDataUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = this.mfa.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret, mfaEnabled: false } });
    const otpauthUri = this.mfa.buildOtpauthUri(user.email, secret);
    const qrCodeDataUrl = await this.mfa.buildQrCodeDataUrl(otpauthUri);
    return { secret, otpauthUri, qrCodeDataUrl };
  }

  async confirmMfaSetup(userId: string, totpCode: string): Promise<{ mfaEnabled: true }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecret) throw new BadRequestException("No MFA setup in progress — call beginMfaSetup first.");
    if (!this.mfa.verify(totpCode, user.mfaSecret)) throw new UnauthorizedException("Invalid MFA code.");

    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    await this.auditLog.record({ organizationId: null, userId, action: "UPDATE", objectType: "User", objectId: userId, newValue: { mfaEnabled: true } });
    return { mfaEnabled: true };
  }

  async disableMfa(userId: string, totpCode: string): Promise<{ mfaEnabled: false }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaEnabled || !user.mfaSecret) throw new BadRequestException("MFA is not currently enabled.");
    if (!this.mfa.verify(totpCode, user.mfaSecret)) throw new UnauthorizedException("Invalid MFA code.");

    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecret: null } });
    await this.auditLog.record({ organizationId: null, userId, action: "UPDATE", objectType: "User", objectId: userId, newValue: { mfaEnabled: false } });
    return { mfaEnabled: false };
  }

  /** Authenticated password change — requires proving the CURRENT password, never a bare "set new password" for a logged-in session. */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) throw new UnauthorizedException("Current password is incorrect.");

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.auditLog.record({ organizationId: null, userId, action: "CHANGE_PASSWORD", objectType: "User", objectId: userId });
  }

  /**
   * Generates a single-use, time-limited reset token. Only its SHA-256 hash is ever
   * persisted — identical principle to passwordHash: a database read alone can never
   * yield a usable token.
   *
   * KNOWN GAP (mandate §11, documented rather than faked): there is no email provider
   * configured in this environment (same "IN_APP only" limitation as NotificationsService
   * elsewhere in this app), so the reset link is NOT actually emailed to the user — it is
   * logged server-side instead. This method's own logic (token generation, hashing,
   * expiry, single-use consumption) is real and correct; only the delivery channel is
   * missing. Wire a real provider (SES/SendGrid/Postmark) and replace the logger.warn call
   * below with an actual send before relying on this in production.
   *
   * Always returns the same generic response regardless of whether the email exists, to
   * avoid confirming/denying account existence to an unauthenticated caller.
   */
  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const GENERIC_RESPONSE = { message: "If an account with that email exists, a password reset link has been sent." };
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return GENERIC_RESPONSE;

    const token = crypto.randomBytes(32).toString("hex");
    const passwordResetTokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const passwordResetExpiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

    await this.prisma.user.update({ where: { id: user.id }, data: { passwordResetTokenHash, passwordResetExpiresAt } });
    await this.auditLog.record({ organizationId: null, userId: user.id, action: "REQUEST_PASSWORD_RESET", objectType: "User", objectId: user.id });

    // NOT a real email send — see docstring. Logged so the flow is at least usable/testable
    // by an operator with log access until a real email provider is wired up.
    this.logger.warn(
      `Password reset requested for ${email} — no email provider configured, so this token is NOT being emailed. ` +
        `Reset link (deliver manually if needed): /reset-password?token=${token} (expires ${passwordResetExpiresAt.toISOString()})`
    );

    return GENERIC_RESPONSE;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await this.prisma.user.findFirst({ where: { passwordResetTokenHash: tokenHash } });

    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new BadRequestException("This password reset link is invalid or has expired.");
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null },
    });
    await this.auditLog.record({ organizationId: null, userId: user.id, action: "RESET_PASSWORD", objectType: "User", objectId: user.id });
  }

  private signToken(
    userId: string,
    email: string,
    organizationId: string | null,
    roleId: string | null,
    roleName: string | null,
    isPlatformAdmin: boolean,
    isTaxRuleApprover: boolean
  ): string {
    const payload: JwtPayload = { sub: userId, email, organizationId, roleId, roleName, isPlatformAdmin, isTaxRuleApprover };
    return this.jwt.sign(payload);
  }
}

import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { JwtPayload, ROLES } from "../common/rbac.constants";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auditLog: AuditLogService
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

    return { accessToken: this.signToken(user.id, user.email, organization.id, ownerRole.id, ownerRole.name, false) };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive) throw new UnauthorizedException("Invalid credentials.");

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) throw new UnauthorizedException("Invalid credentials.");

    // Phase 1 simplification: log in to the first ACTIVE membership found. A user who
    // belongs to multiple organizations will need an org-switcher endpoint (Phase 2+) to
    // re-issue a token scoped to a different membership.
    const membership = await this.prisma.organizationUser.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      include: { role: true },
    });

    if (!membership && !user.isPlatformAdmin) {
      throw new UnauthorizedException("User has no active organization membership.");
    }

    await this.auditLog.record({
      organizationId: membership?.organizationId ?? null,
      userId: user.id,
      action: "LOGIN",
      objectType: "User",
      objectId: user.id,
    });

    return {
      accessToken: this.signToken(
        user.id,
        user.email,
        membership?.organizationId ?? null,
        membership?.roleId ?? null,
        membership?.role.name ?? null,
        user.isPlatformAdmin
      ),
    };
  }

  private signToken(
    userId: string,
    email: string,
    organizationId: string | null,
    roleId: string | null,
    roleName: string | null,
    isPlatformAdmin: boolean
  ): string {
    const payload: JwtPayload = { sub: userId, email, organizationId, roleId, roleName, isPlatformAdmin };
    return this.jwt.sign(payload);
  }
}

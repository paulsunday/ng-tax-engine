import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../prisma/prisma.service";
import { JwtPayload } from "../../common/rbac.constants";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error(
        "JWT_SECRET is not set. Refusing to start with a fallback/default secret — set it in the environment " +
          "(brief §30: do not store secrets insecurely, and a guessable default is equally unsafe)."
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Re-fetches the live user on every authenticated request rather than trusting the
   * signed payload's role/flags for the token's full 8h lifetime (security audit finding,
   * 2026-10-17): without this, a deactivated account, a revoked isPlatformAdmin/
   * isTaxRuleApprover flag, or a role reassignment would silently keep its OLD access until
   * the token naturally expired — stale authorization data from a cryptographically valid
   * token. PermissionsGuard already does the equivalent live lookup for permission grants
   * (see its own docstring); this closes the same gap one layer up, for the account-level
   * flags that guard reads directly off request.user. organizationId/roleId in the
   * RETURNED payload always reflect the CURRENT row, not the token's original claims.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, isActive: true, isPlatformAdmin: true, isTaxRuleApprover: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Account is no longer active.");
    }

    let roleId = payload.roleId;
    let roleName = payload.roleName;
    if (payload.organizationId) {
      const membership = await this.prisma.organizationUser.findUnique({
        where: { organizationId_userId: { organizationId: payload.organizationId, userId: user.id } },
        include: { role: { select: { name: true } } },
      });
      // Only ACTIVE counts — INVITED (invitation not yet accepted) and DISABLED must both
      // be refused here, not just DISABLED (security finding 2026-10-17: an INVITED
      // membership must never grant a working session before the invite is accepted).
      if (!membership || membership.status !== "ACTIVE") {
        throw new UnauthorizedException("No longer an active member of this organization.");
      }
      roleId = membership.roleId;
      roleName = membership.role.name;
    }

    return {
      sub: user.id,
      email: user.email,
      organizationId: payload.organizationId,
      roleId,
      roleName,
      isPlatformAdmin: user.isPlatformAdmin,
      isTaxRuleApprover: user.isTaxRuleApprover,
    };
  }
}

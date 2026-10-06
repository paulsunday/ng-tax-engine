import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../../prisma/prisma.service";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";
import { JwtPayload, PermissionKey } from "../rbac.constants";

/**
 * Enforces @RequirePermissions(...) against the caller's role. Platform admins bypass
 * entirely (brief §5: Platform Administrator manages tenants, not bound by tenant RBAC).
 * Must run AFTER JwtAuthGuard so request.user is populated.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: JwtPayload | undefined = request.user;
    if (!user) throw new ForbiddenException("No authenticated user on request.");
    if (user.isPlatformAdmin) return true;
    if (!user.roleId) throw new ForbiddenException("User has no role assigned in this organization.");

    const grantedPermissions = await this.prisma.rolePermission.findMany({
      where: { roleId: user.roleId, permission: { key: { in: required } } },
      select: { permission: { select: { key: true } } },
    });
    const grantedKeys = new Set(grantedPermissions.map((p) => p.permission.key));
    const missing = required.filter((r) => !grantedKeys.has(r));

    if (missing.length > 0) {
      throw new ForbiddenException(`Missing required permission(s): ${missing.join(", ")}`);
    }
    return true;
  }
}

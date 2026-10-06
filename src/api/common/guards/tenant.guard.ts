import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { JwtPayload } from "../rbac.constants";

/**
 * First line of tenant-isolation defense (brief §4): refuses a request outright if the
 * route's :organizationId param doesn't match the caller's own organization. This does
 * NOT replace organization-scoped `where` clauses in service methods — a route with no
 * :organizationId param (e.g. /companies/:companyId) still needs its service method to
 * verify companyId belongs to request.user.organizationId before returning/mutating
 * anything, because the tenant boundary for that resource isn't visible in the URL here.
 * Platform admins bypass (they manage tenants, not bound by a single one).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: JwtPayload | undefined = request.user;
    if (!user) throw new ForbiddenException("No authenticated user on request.");
    if (user.isPlatformAdmin) return true;

    const routeOrgId = request.params?.organizationId;
    if (routeOrgId && routeOrgId !== user.organizationId) {
      throw new ForbiddenException("Cannot access another organization's resources.");
    }
    return true;
  }
}

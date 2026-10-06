import { ForbiddenException, ExecutionContext } from "@nestjs/common";
import { TenantGuard } from "../../src/api/common/guards/tenant.guard";
import { PermissionsGuard } from "../../src/api/common/guards/permissions.guard";
import { PERMISSIONS, JwtPayload } from "../../src/api/common/rbac.constants";

function makeContext(user: JwtPayload | undefined, params: Record<string, string> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe("TenantGuard (brief §4)", () => {
  test("allows access when there is no :organizationId route param", () => {
    const guard = new TenantGuard();
    const ctx = makeContext({ sub: "u1", email: "a@b.com", organizationId: "org-A", roleId: "r1", roleName: "ACCOUNTANT", isPlatformAdmin: false });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  test("allows access when :organizationId matches the caller's own organization", () => {
    const guard = new TenantGuard();
    const ctx = makeContext(
      { sub: "u1", email: "a@b.com", organizationId: "org-A", roleId: "r1", roleName: "ACCOUNTANT", isPlatformAdmin: false },
      { organizationId: "org-A" }
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  test("blocks access when :organizationId does NOT match the caller's organization", () => {
    const guard = new TenantGuard();
    const ctx = makeContext(
      { sub: "u1", email: "a@b.com", organizationId: "org-A", roleId: "r1", roleName: "ACCOUNTANT", isPlatformAdmin: false },
      { organizationId: "org-B" }
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  test("platform admin bypasses the tenant check entirely", () => {
    const guard = new TenantGuard();
    const ctx = makeContext(
      { sub: "admin", email: "admin@platform.com", organizationId: null, roleId: null, roleName: null, isPlatformAdmin: true },
      { organizationId: "org-ANY" }
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  test("throws if there is no authenticated user on the request at all", () => {
    const guard = new TenantGuard();
    const ctx = makeContext(undefined, { organizationId: "org-A" });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

describe("PermissionsGuard (brief §5)", () => {
  function makeReflector(required: string[] | undefined) {
    return { getAllAndOverride: jest.fn(() => required) } as any;
  }

  test("allows access when the route declares no required permissions", async () => {
    const prisma: any = { rolePermission: { findMany: jest.fn() } };
    const guard = new PermissionsGuard(makeReflector(undefined), prisma);
    const ctx = makeContext({ sub: "u1", email: "a@b.com", organizationId: "org-A", roleId: "r1", roleName: "ACCOUNTANT", isPlatformAdmin: false });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
  });

  test("platform admin bypasses permission checks entirely", async () => {
    const prisma: any = { rolePermission: { findMany: jest.fn() } };
    const guard = new PermissionsGuard(makeReflector([PERMISSIONS.MANAGE_USERS]), prisma);
    const ctx = makeContext({ sub: "admin", email: "a@b.com", organizationId: null, roleId: null, roleName: null, isPlatformAdmin: true });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  test("grants access when the DB confirms the role holds the required permission", async () => {
    const prisma: any = {
      rolePermission: { findMany: jest.fn().mockResolvedValue([{ permission: { key: PERMISSIONS.MANAGE_USERS } }]) },
    };
    const guard = new PermissionsGuard(makeReflector([PERMISSIONS.MANAGE_USERS]), prisma);
    const ctx = makeContext({ sub: "u1", email: "a@b.com", organizationId: "org-A", roleId: "role-owner", roleName: "COMPANY_OWNER", isPlatformAdmin: false });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  test("denies access with ForbiddenException when the role lacks the required permission", async () => {
    const prisma: any = { rolePermission: { findMany: jest.fn().mockResolvedValue([]) } };
    const guard = new PermissionsGuard(makeReflector([PERMISSIONS.MANAGE_USERS]), prisma);
    const ctx = makeContext({ sub: "u1", email: "a@b.com", organizationId: "org-A", roleId: "role-employee", roleName: "EMPLOYEE", isPlatformAdmin: false });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  test("denies access when the user has no role assigned at all", async () => {
    const prisma: any = { rolePermission: { findMany: jest.fn() } };
    const guard = new PermissionsGuard(makeReflector([PERMISSIONS.MANAGE_USERS]), prisma);
    const ctx = makeContext({ sub: "u1", email: "a@b.com", organizationId: "org-A", roleId: null, roleName: null, isPlatformAdmin: false });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});

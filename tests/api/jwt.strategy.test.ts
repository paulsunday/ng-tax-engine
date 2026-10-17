import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy } from "../../src/api/auth/strategies/jwt.strategy";
import { JwtPayload } from "../../src/api/common/rbac.constants";

function makeMocks() {
  const prisma: any = {
    user: { findUnique: jest.fn() },
    organizationUser: { findUnique: jest.fn() },
  };
  return { prisma };
}

const basePayload: JwtPayload = {
  sub: "u1",
  email: "a@b.com",
  organizationId: "org-A",
  roleId: "old-role-id",
  roleName: "ACCOUNTANT",
  isPlatformAdmin: false,
  isTaxRuleApprover: false,
};

describe("JwtStrategy.validate — re-checks live account state on every request", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret-not-for-production";
  });

  test("rejects a token for a user that no longer exists", async () => {
    const { prisma } = makeMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    const strategy = new JwtStrategy(prisma);

    await expect(strategy.validate(basePayload)).rejects.toThrow(UnauthorizedException);
  });

  test("rejects a token for a deactivated account, even though the signature is valid", async () => {
    const { prisma } = makeMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", isActive: false, isPlatformAdmin: false, isTaxRuleApprover: false });
    const strategy = new JwtStrategy(prisma);

    await expect(strategy.validate(basePayload)).rejects.toThrow(UnauthorizedException);
  });

  test("rejects a token for a user removed from the organization the token claims", async () => {
    const { prisma } = makeMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", isActive: true, isPlatformAdmin: false, isTaxRuleApprover: false });
    prisma.organizationUser.findUnique.mockResolvedValue(null);
    const strategy = new JwtStrategy(prisma);

    await expect(strategy.validate(basePayload)).rejects.toThrow(UnauthorizedException);
  });

  test("rejects a token for a DISABLED (not deleted) membership", async () => {
    const { prisma } = makeMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", isActive: true, isPlatformAdmin: false, isTaxRuleApprover: false });
    prisma.organizationUser.findUnique.mockResolvedValue({ roleId: "old-role-id", status: "DISABLED", role: { name: "ACCOUNTANT" } });
    const strategy = new JwtStrategy(prisma);

    await expect(strategy.validate(basePayload)).rejects.toThrow(UnauthorizedException);
  });

  test("rejects a token for an INVITED (not yet accepted) membership — an unaccepted invite must never grant a working session", async () => {
    const { prisma } = makeMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", isActive: true, isPlatformAdmin: false, isTaxRuleApprover: false });
    prisma.organizationUser.findUnique.mockResolvedValue({ roleId: "old-role-id", status: "INVITED", role: { name: "ACCOUNTANT" } });
    const strategy = new JwtStrategy(prisma);

    await expect(strategy.validate(basePayload)).rejects.toThrow(UnauthorizedException);
  });

  test("reflects a role reassignment made AFTER the token was signed, not the token's original roleId", async () => {
    const { prisma } = makeMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", isActive: true, isPlatformAdmin: false, isTaxRuleApprover: false });
    prisma.organizationUser.findUnique.mockResolvedValue({ roleId: "NEW-role-id", status: "ACTIVE", role: { name: "AUDITOR" } });
    const strategy = new JwtStrategy(prisma);

    const result = await strategy.validate(basePayload);

    expect(result.roleId).toBe("NEW-role-id");
    expect(result.roleName).toBe("AUDITOR");
  });

  test("reflects a revoked isTaxRuleApprover/isPlatformAdmin flag made AFTER the token was signed", async () => {
    const { prisma } = makeMocks();
    // Token itself claims isTaxRuleApprover: true (stale — see payload below), but the
    // live row says it was revoked. The live row must win.
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", isActive: true, isPlatformAdmin: false, isTaxRuleApprover: false });
    prisma.organizationUser.findUnique.mockResolvedValue({ roleId: "old-role-id", status: "ACTIVE", role: { name: "ACCOUNTANT" } });
    const strategy = new JwtStrategy(prisma);

    const staleTokenClaimingApprover: JwtPayload = { ...basePayload, isTaxRuleApprover: true };
    const result = await strategy.validate(staleTokenClaimingApprover);

    expect(result.isTaxRuleApprover).toBe(false);
  });

  test("a valid, active, unchanged user passes through with live data", async () => {
    const { prisma } = makeMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", isActive: true, isPlatformAdmin: false, isTaxRuleApprover: false });
    prisma.organizationUser.findUnique.mockResolvedValue({ roleId: "old-role-id", status: "ACTIVE", role: { name: "ACCOUNTANT" } });
    const strategy = new JwtStrategy(prisma);

    const result = await strategy.validate(basePayload);

    expect(result).toEqual(basePayload);
  });

  test("a platform-admin token with no organizationId skips the membership check entirely", async () => {
    const { prisma } = makeMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "admin@b.com", isActive: true, isPlatformAdmin: true, isTaxRuleApprover: false });
    const strategy = new JwtStrategy(prisma);

    const payload: JwtPayload = { ...basePayload, organizationId: null, roleId: null, roleName: null, isPlatformAdmin: true };
    const result = await strategy.validate(payload);

    expect(prisma.organizationUser.findUnique).not.toHaveBeenCalled();
    expect(result.isPlatformAdmin).toBe(true);
  });
});

import * as bcrypt from "bcrypt";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../../src/api/auth/auth.service";
import { ROLES } from "../../src/api/common/rbac.constants";

function makeMocks() {
  const prisma: any = {
    user: { findUnique: jest.fn(), create: jest.fn() },
    role: { findUnique: jest.fn() },
    organizationUser: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
    organization: { create: jest.fn() },
  };
  const jwt: any = { sign: jest.fn(() => "signed.jwt.token") };
  const auditLog: any = { record: jest.fn() };
  const mfa: any = { verify: jest.fn(), generateSecret: jest.fn(), buildOtpauthUri: jest.fn(), buildQrCodeDataUrl: jest.fn() };
  return { prisma, jwt, auditLog, mfa };
}

describe("AuthService.register", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret-not-for-production";
  });

  test("rejects a duplicate email with ConflictException", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "existing-user" });
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    await expect(
      service.register({ email: "dup@example.com", password: "password1234", fullName: "Dup User", organizationName: "Dup Co" })
    ).rejects.toThrow(ConflictException);
  });

  test("throws if the COMPANY_OWNER role has not been seeded", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue(null);
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    await expect(
      service.register({ email: "new@example.com", password: "password1234", fullName: "New User", organizationName: "New Co" })
    ).rejects.toThrow(/seed-rbac/);
  });

  test("creates organization + user + COMPANY_OWNER membership, hashes the password, and signs a token", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue({ id: "role-owner", name: ROLES.COMPANY_OWNER });
    prisma.organization.create.mockResolvedValue({ id: "org-1", name: "New Co" });
    prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: "user-1", ...data }));
    prisma.organizationUser.create = jest.fn().mockResolvedValue({ id: "membership-1" });

    const service = new AuthService(prisma, jwt, auditLog, mfa);
    const result = await service.register({
      email: "new@example.com",
      password: "password1234",
      fullName: "New User",
      organizationName: "New Co",
    });

    expect(prisma.user.create).toHaveBeenCalled();
    const createdUserArgs = prisma.user.create.mock.calls[0][0].data;
    expect(createdUserArgs.passwordHash).not.toBe("password1234"); // never store the plaintext
    expect(await bcrypt.compare("password1234", createdUserArgs.passwordHash)).toBe(true);

    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", action: "CREATE", objectType: "Organization" })
    );
    expect(result.accessToken).toBe("signed.jwt.token");
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1", roleName: ROLES.COMPANY_OWNER, isPlatformAdmin: false })
    );
  });
});

describe("AuthService.login", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret-not-for-production";
  });

  test("rejects an unknown email with UnauthorizedException (not a different error that could leak existence)", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    await expect(service.login({ email: "nobody@example.com", password: "whatever123" })).rejects.toThrow(UnauthorizedException);
  });

  test("rejects a wrong password with UnauthorizedException", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false });
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    await expect(service.login({ email: "a@b.com", password: "wrong-password" })).rejects.toThrow(UnauthorizedException);
  });

  test("rejects a deactivated user even with the correct password", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: false, isPlatformAdmin: false });
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    await expect(service.login({ email: "a@b.com", password: "correct-password" })).rejects.toThrow(UnauthorizedException);
  });

  test("rejects a user with no active organization membership (unless platform admin)", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false });
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    await expect(service.login({ email: "a@b.com", password: "correct-password" })).rejects.toThrow(UnauthorizedException);
  });

  test("succeeds for a correct password and active membership, returning a signed token scoped to that org/role", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false });
    prisma.organizationUser.findMany.mockResolvedValue([
      { organizationId: "org-9", roleId: "role-9", role: { name: ROLES.ACCOUNTANT }, organization: { name: "Org 9" } },
    ]);
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    const result = await service.login({ email: "a@b.com", password: "correct-password" });
    expect(result.accessToken).toBe("signed.jwt.token");
    expect(result.requiresOrganizationSelection).toBe(false);
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-9", roleName: ROLES.ACCOUNTANT }));
  });

  test("a user with multiple active memberships gets a token with NO organization selected, and must switch explicitly", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false });
    prisma.organizationUser.findMany.mockResolvedValue([
      { organizationId: "org-1", roleId: "role-1", role: { name: ROLES.ACCOUNTANT }, organization: { name: "Org One" } },
      { organizationId: "org-2", roleId: "role-2", role: { name: ROLES.COMPANY_OWNER }, organization: { name: "Org Two" } },
    ]);
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    const result = await service.login({ email: "a@b.com", password: "correct-password" });

    expect(result.requiresOrganizationSelection).toBe(true);
    expect(result.organizations).toHaveLength(2);
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null, roleId: null, roleName: null }));
  });

  test("platform admin can log in with no organization membership at all", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "admin@platform.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: true });
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    const result = await service.login({ email: "admin@platform.com", password: "correct-password" });
    expect(result.accessToken).toBe("signed.jwt.token");
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null, isPlatformAdmin: true }));
  });

  test("rejects login for an MFA-enabled user who omits the TOTP code", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false, mfaEnabled: true, mfaSecret: "SECRET" });
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    await expect(service.login({ email: "a@b.com", password: "correct-password" })).rejects.toThrow(/MFA code required/);
    expect(mfa.verify).not.toHaveBeenCalled();
  });

  test("rejects login for an MFA-enabled user who supplies an invalid TOTP code", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false, mfaEnabled: true, mfaSecret: "SECRET" });
    mfa.verify.mockReturnValue(false);
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    await expect(service.login({ email: "a@b.com", password: "correct-password", totpCode: "000000" })).rejects.toThrow(/Invalid MFA code/);
  });

  test("succeeds for an MFA-enabled user who supplies a valid TOTP code", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false, mfaEnabled: true, mfaSecret: "SECRET" });
    prisma.organizationUser.findMany.mockResolvedValue([
      { organizationId: "org-9", roleId: "role-9", role: { name: ROLES.ACCOUNTANT }, organization: { name: "Org 9" } },
    ]);
    mfa.verify.mockReturnValue(true);
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    const result = await service.login({ email: "a@b.com", password: "correct-password", totpCode: "123456" });
    expect(mfa.verify).toHaveBeenCalledWith("123456", "SECRET");
    expect(result.accessToken).toBe("signed.jwt.token");
  });
});

describe("AuthService.switchOrganization — tenant isolation (mandate §10)", () => {
  test("rejects switching into an organization the user is not an active member of, without revealing whether it exists", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    prisma.user.findUniqueOrThrow = jest.fn().mockResolvedValue({ id: "u1", email: "a@b.com" });
    prisma.organizationUser.findFirst.mockResolvedValue(null);
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    await expect(service.switchOrganization("u1", "org-not-mine")).rejects.toThrow(/No active membership/);
  });

  test("issues a fresh token scoped to the target organization when the user IS an active member", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    prisma.user.findUniqueOrThrow = jest.fn().mockResolvedValue({ id: "u1", email: "a@b.com", isPlatformAdmin: false, isTaxRuleApprover: false });
    prisma.organizationUser.findFirst.mockResolvedValue({ organizationId: "org-2", roleId: "role-2", role: { name: ROLES.COMPANY_OWNER } });
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    const result = await service.switchOrganization("u1", "org-2");

    expect(result.accessToken).toBe("signed.jwt.token");
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-2", roleName: ROLES.COMPANY_OWNER }));
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: "SWITCH_ORGANIZATION", organizationId: "org-2" }));
  });

  test("a membership in a DIFFERENT organization than the one requested does not satisfy the switch (no cross-tenant leakage)", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    prisma.user.findUniqueOrThrow = jest.fn().mockResolvedValue({ id: "u1", email: "a@b.com" });
    // findFirst is called WITH organizationId in its where clause — simulate Prisma
    // correctly returning null when the membership row doesn't match that organization.
    prisma.organizationUser.findFirst.mockImplementation(async ({ where }: any) => (where.organizationId === "org-mine" ? { organizationId: "org-mine", roleId: "r1", role: { name: ROLES.EMPLOYEE } } : null));
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    await expect(service.switchOrganization("u1", "org-someone-elses")).rejects.toThrow(/No active membership/);
    await expect(service.switchOrganization("u1", "org-mine")).resolves.toBeDefined();
  });
});

describe("AuthService.listMyMemberships", () => {
  test("returns only the caller's own memberships, shaped for an org-switcher UI", async () => {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    prisma.organizationUser.findMany.mockResolvedValue([
      { organizationId: "org-1", roleId: "role-1", role: { name: ROLES.ACCOUNTANT }, organization: { name: "Org One" } },
    ]);
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    const result = await service.listMyMemberships("u1");

    expect(result).toEqual([{ organizationId: "org-1", organizationName: "Org One", roleName: ROLES.ACCOUNTANT }]);
    expect(prisma.organizationUser.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", status: "ACTIVE" } }));
  });
});

describe("AuthService MFA setup/enable/disable", () => {
  function userMocks(overrides: Partial<{ mfaEnabled: boolean; mfaSecret: string | null }> = {}) {
    const { prisma, jwt, auditLog, mfa } = makeMocks();
    prisma.user.findUniqueOrThrow = jest.fn().mockResolvedValue({ id: "u1", email: "a@b.com", mfaEnabled: false, mfaSecret: null, ...overrides });
    prisma.user.update = jest.fn().mockResolvedValue({});
    return { prisma, jwt, auditLog, mfa };
  }

  test("beginMfaSetup stores a fresh secret with mfaEnabled left false until confirmed", async () => {
    const { prisma, jwt, auditLog, mfa } = userMocks();
    mfa.generateSecret.mockReturnValue("NEWSECRET");
    mfa.buildOtpauthUri.mockReturnValue("otpauth://totp/...");
    mfa.buildQrCodeDataUrl.mockResolvedValue("data:image/png;base64,abc");
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    const result = await service.beginMfaSetup("u1");

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { mfaSecret: "NEWSECRET", mfaEnabled: false } });
    expect(result).toEqual({ secret: "NEWSECRET", otpauthUri: "otpauth://totp/...", qrCodeDataUrl: "data:image/png;base64,abc" });
  });

  test("confirmMfaSetup rejects an invalid code and does not enable MFA", async () => {
    const { prisma, jwt, auditLog, mfa } = userMocks({ mfaSecret: "PENDINGSECRET" });
    mfa.verify.mockReturnValue(false);
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    await expect(service.confirmMfaSetup("u1", "000000")).rejects.toThrow(/Invalid MFA code/);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("confirmMfaSetup enables MFA once a valid code is supplied", async () => {
    const { prisma, jwt, auditLog, mfa } = userMocks({ mfaSecret: "PENDINGSECRET" });
    mfa.verify.mockReturnValue(true);
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    const result = await service.confirmMfaSetup("u1", "123456");

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { mfaEnabled: true } });
    expect(result).toEqual({ mfaEnabled: true });
  });

  test("disableMfa requires a valid code and clears both mfaEnabled and mfaSecret", async () => {
    const { prisma, jwt, auditLog, mfa } = userMocks({ mfaEnabled: true, mfaSecret: "ACTIVESECRET" });
    mfa.verify.mockReturnValue(true);
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    const result = await service.disableMfa("u1", "123456");

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { mfaEnabled: false, mfaSecret: null } });
    expect(result).toEqual({ mfaEnabled: false });
  });

  test("disableMfa rejects when MFA is not currently enabled", async () => {
    const { prisma, jwt, auditLog, mfa } = userMocks({ mfaEnabled: false, mfaSecret: null });
    const service = new AuthService(prisma, jwt, auditLog, mfa);

    await expect(service.disableMfa("u1", "123456")).rejects.toThrow(/not currently enabled/);
  });
});

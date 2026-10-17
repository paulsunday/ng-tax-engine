import * as bcrypt from "bcrypt";
import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
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
  const email: any = { send: jest.fn().mockResolvedValue({ sent: false }), isConfigured: jest.fn().mockReturnValue(false) };
  return { prisma, jwt, auditLog, mfa, email };
}

describe("AuthService.register", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret-not-for-production";
  });

  test("rejects a duplicate email with ConflictException", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "existing-user" });
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(
      service.register({ email: "dup@example.com", password: "password1234", fullName: "Dup User", organizationName: "Dup Co", acceptedTerms: true })
    ).rejects.toThrow(ConflictException);
  });

  test("throws if the COMPANY_OWNER role has not been seeded", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue(null);
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(
      service.register({ email: "new@example.com", password: "password1234", fullName: "New User", organizationName: "New Co", acceptedTerms: true })
    ).rejects.toThrow(/seed-rbac/);
  });

  test("creates organization + user + COMPANY_OWNER membership, hashes the password, and signs a token", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue({ id: "role-owner", name: ROLES.COMPANY_OWNER });
    prisma.organization.create.mockResolvedValue({ id: "org-1", name: "New Co" });
    prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: "user-1", ...data }));
    prisma.organizationUser.create = jest.fn().mockResolvedValue({ id: "membership-1" });

    const service = new AuthService(prisma, jwt, auditLog, mfa, email);
    const result = await service.register({
      email: "new@example.com",
      password: "password1234",
      fullName: "New User",
      organizationName: "New Co",
      acceptedTerms: true,
    });

    expect(prisma.user.create).toHaveBeenCalled();
    const createdUserArgs = prisma.user.create.mock.calls[0][0].data;
    expect(createdUserArgs.passwordHash).not.toBe("password1234"); // never store the plaintext
    const createdOrgArgs = prisma.organization.create.mock.calls[0][0].data;
    expect(createdOrgArgs.termsAcceptedAt).toBeInstanceOf(Date); // real acceptance recorded, not assumed
    expect(createdOrgArgs.termsVersion).toBeTruthy();
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
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.login({ email: "nobody@example.com", password: "whatever123" })).rejects.toThrow(UnauthorizedException);
  });

  test("rejects a wrong password with UnauthorizedException", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false });
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.login({ email: "a@b.com", password: "wrong-password" })).rejects.toThrow(UnauthorizedException);
  });

  test("rejects a deactivated user even with the correct password", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: false, isPlatformAdmin: false });
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.login({ email: "a@b.com", password: "correct-password" })).rejects.toThrow(UnauthorizedException);
  });

  test("rejects a user with no active organization membership (unless platform admin)", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false });
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.login({ email: "a@b.com", password: "correct-password" })).rejects.toThrow(UnauthorizedException);
  });

  test("succeeds for a correct password and active membership, returning a signed token scoped to that org/role", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false });
    prisma.organizationUser.findMany.mockResolvedValue([
      { organizationId: "org-9", roleId: "role-9", role: { name: ROLES.ACCOUNTANT }, organization: { name: "Org 9" } },
    ]);
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    const result = await service.login({ email: "a@b.com", password: "correct-password" });
    expect(result.accessToken).toBe("signed.jwt.token");
    expect(result.requiresOrganizationSelection).toBe(false);
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-9", roleName: ROLES.ACCOUNTANT }));
  });

  test("a user with multiple active memberships gets a token with NO organization selected, and must switch explicitly", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false });
    prisma.organizationUser.findMany.mockResolvedValue([
      { organizationId: "org-1", roleId: "role-1", role: { name: ROLES.ACCOUNTANT }, organization: { name: "Org One" } },
      { organizationId: "org-2", roleId: "role-2", role: { name: ROLES.COMPANY_OWNER }, organization: { name: "Org Two" } },
    ]);
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    const result = await service.login({ email: "a@b.com", password: "correct-password" });

    expect(result.requiresOrganizationSelection).toBe(true);
    expect(result.organizations).toHaveLength(2);
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null, roleId: null, roleName: null }));
  });

  test("platform admin can log in with no organization membership at all", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "admin@platform.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: true });
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    const result = await service.login({ email: "admin@platform.com", password: "correct-password" });
    expect(result.accessToken).toBe("signed.jwt.token");
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null, isPlatformAdmin: true }));
  });

  test("rejects login for an MFA-enabled user who omits the TOTP code", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false, mfaEnabled: true, mfaSecret: "SECRET" });
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.login({ email: "a@b.com", password: "correct-password" })).rejects.toThrow(/MFA code required/);
    expect(mfa.verify).not.toHaveBeenCalled();
  });

  test("rejects login for an MFA-enabled user who supplies an invalid TOTP code", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false, mfaEnabled: true, mfaSecret: "SECRET" });
    mfa.verify.mockReturnValue(false);
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.login({ email: "a@b.com", password: "correct-password", totpCode: "000000" })).rejects.toThrow(/Invalid MFA code/);
  });

  test("succeeds for an MFA-enabled user who supplies a valid TOTP code", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false, mfaEnabled: true, mfaSecret: "SECRET" });
    prisma.organizationUser.findMany.mockResolvedValue([
      { organizationId: "org-9", roleId: "role-9", role: { name: ROLES.ACCOUNTANT }, organization: { name: "Org 9" } },
    ]);
    mfa.verify.mockReturnValue(true);
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    const result = await service.login({ email: "a@b.com", password: "correct-password", totpCode: "123456" });
    expect(mfa.verify).toHaveBeenCalledWith("123456", "SECRET");
    expect(result.accessToken).toBe("signed.jwt.token");
  });
});

describe("AuthService.switchOrganization — tenant isolation (mandate §10)", () => {
  test("rejects switching into an organization the user is not an active member of, without revealing whether it exists", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.user.findUniqueOrThrow = jest.fn().mockResolvedValue({ id: "u1", email: "a@b.com" });
    prisma.organizationUser.findFirst.mockResolvedValue(null);
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.switchOrganization("u1", "org-not-mine")).rejects.toThrow(/No active membership/);
  });

  test("issues a fresh token scoped to the target organization when the user IS an active member", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.user.findUniqueOrThrow = jest.fn().mockResolvedValue({ id: "u1", email: "a@b.com", isPlatformAdmin: false, isTaxRuleApprover: false });
    prisma.organizationUser.findFirst.mockResolvedValue({ organizationId: "org-2", roleId: "role-2", role: { name: ROLES.COMPANY_OWNER } });
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    const result = await service.switchOrganization("u1", "org-2");

    expect(result.accessToken).toBe("signed.jwt.token");
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-2", roleName: ROLES.COMPANY_OWNER }));
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: "SWITCH_ORGANIZATION", organizationId: "org-2" }));
  });

  test("a membership in a DIFFERENT organization than the one requested does not satisfy the switch (no cross-tenant leakage)", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.user.findUniqueOrThrow = jest.fn().mockResolvedValue({ id: "u1", email: "a@b.com" });
    // findFirst is called WITH organizationId in its where clause — simulate Prisma
    // correctly returning null when the membership row doesn't match that organization.
    prisma.organizationUser.findFirst.mockImplementation(async ({ where }: any) => (where.organizationId === "org-mine" ? { organizationId: "org-mine", roleId: "r1", role: { name: ROLES.EMPLOYEE } } : null));
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.switchOrganization("u1", "org-someone-elses")).rejects.toThrow(/No active membership/);
    await expect(service.switchOrganization("u1", "org-mine")).resolves.toBeDefined();
  });
});

describe("AuthService.listMyMemberships", () => {
  test("returns only the caller's own memberships, shaped for an org-switcher UI", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.organizationUser.findMany.mockResolvedValue([
      { organizationId: "org-1", roleId: "role-1", role: { name: ROLES.ACCOUNTANT }, organization: { name: "Org One" } },
    ]);
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    const result = await service.listMyMemberships("u1");

    expect(result).toEqual([{ organizationId: "org-1", organizationName: "Org One", roleName: ROLES.ACCOUNTANT }]);
    expect(prisma.organizationUser.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", status: "ACTIVE" } }));
  });
});

describe("AuthService.changePassword", () => {
  test("rejects an incorrect current password, and never touches passwordHash", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    const correctHash = await bcrypt.hash("correct-current", 4);
    prisma.user.findUniqueOrThrow = jest.fn().mockResolvedValue({ id: "u1", passwordHash: correctHash });
    prisma.user.update = jest.fn();
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.changePassword("u1", "wrong-current", "brand-new-password")).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("updates the password hash when the current password is correct", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    const correctHash = await bcrypt.hash("correct-current", 4);
    prisma.user.findUniqueOrThrow = jest.fn().mockResolvedValue({ id: "u1", passwordHash: correctHash });
    prisma.user.update = jest.fn().mockResolvedValue({});
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await service.changePassword("u1", "correct-current", "brand-new-password");

    const updateArgs = prisma.user.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "u1" });
    expect(await bcrypt.compare("brand-new-password", updateArgs.data.passwordHash)).toBe(true);
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: "CHANGE_PASSWORD", userId: "u1" }));
  });
});

describe("AuthService.requestPasswordReset / resetPassword", () => {
  test("requestPasswordReset returns the same generic message whether or not the email exists (no account enumeration)", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.user.findUnique.mockResolvedValueOnce(null); // unknown email
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);
    const unknownResult = await service.requestPasswordReset("nobody@example.com");

    prisma.user.findUnique.mockResolvedValueOnce({ id: "u1", email: "a@b.com", isActive: true }); // known email
    prisma.user.update = jest.fn().mockResolvedValue({});
    const knownResult = await service.requestPasswordReset("a@b.com");

    expect(unknownResult).toEqual(knownResult);
  });

  test("requestPasswordReset stores only a hash of the token, never the raw token", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", isActive: true });
    prisma.user.update = jest.fn().mockResolvedValue({});
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await service.requestPasswordReset("a@b.com");

    const updateArgs = prisma.user.update.mock.calls[0][0];
    expect(updateArgs.data.passwordResetTokenHash).toHaveLength(64); // sha256 hex digest length
    expect(updateArgs.data.passwordResetExpiresAt).toBeInstanceOf(Date);
  });

  test("sends via EmailService when configured, with a reset link containing the raw token", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", isActive: true });
    prisma.user.update = jest.fn().mockResolvedValue({});
    email.send.mockResolvedValue({ sent: true });
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await service.requestPasswordReset("a@b.com");

    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "a@b.com", text: expect.stringContaining("token=") })
    );
  });

  test("does not generate a reset token for a deactivated account", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", isActive: false });
    prisma.user.update = jest.fn();
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await service.requestPasswordReset("a@b.com");

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("resetPassword rejects an unknown or already-used token", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.user.findFirst = jest.fn().mockResolvedValue(null);
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.resetPassword("bogus-token", "brand-new-password")).rejects.toThrow(BadRequestException);
  });

  test("resetPassword rejects an expired token", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.user.findFirst = jest.fn().mockResolvedValue({ id: "u1", passwordResetExpiresAt: new Date(Date.now() - 1000) });
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.resetPassword("some-token", "brand-new-password")).rejects.toThrow(/expired/);
  });

  test("resetPassword succeeds for a valid, unexpired token and clears the token fields (single-use)", async () => {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.user.findFirst = jest.fn().mockResolvedValue({ id: "u1", passwordResetExpiresAt: new Date(Date.now() + 60_000) });
    prisma.user.update = jest.fn().mockResolvedValue({});
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await service.resetPassword("valid-token", "brand-new-password");

    const updateArgs = prisma.user.update.mock.calls[0][0];
    expect(updateArgs.data.passwordResetTokenHash).toBeNull();
    expect(updateArgs.data.passwordResetExpiresAt).toBeNull();
    expect(await bcrypt.compare("brand-new-password", updateArgs.data.passwordHash)).toBe(true);
  });
});

describe("AuthService MFA setup/enable/disable", () => {
  function userMocks(overrides: Partial<{ mfaEnabled: boolean; mfaSecret: string | null }> = {}) {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.user.findUniqueOrThrow = jest.fn().mockResolvedValue({ id: "u1", email: "a@b.com", mfaEnabled: false, mfaSecret: null, ...overrides });
    prisma.user.update = jest.fn().mockResolvedValue({});
    return { prisma, jwt, auditLog, mfa, email };
  }

  test("beginMfaSetup stores a fresh secret with mfaEnabled left false until confirmed", async () => {
    const { prisma, jwt, auditLog, mfa, email } = userMocks();
    mfa.generateSecret.mockReturnValue("NEWSECRET");
    mfa.buildOtpauthUri.mockReturnValue("otpauth://totp/...");
    mfa.buildQrCodeDataUrl.mockResolvedValue("data:image/png;base64,abc");
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    const result = await service.beginMfaSetup("u1");

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { mfaSecret: "NEWSECRET", mfaEnabled: false } });
    expect(result).toEqual({ secret: "NEWSECRET", otpauthUri: "otpauth://totp/...", qrCodeDataUrl: "data:image/png;base64,abc" });
  });

  test("confirmMfaSetup rejects an invalid code and does not enable MFA", async () => {
    const { prisma, jwt, auditLog, mfa, email } = userMocks({ mfaSecret: "PENDINGSECRET" });
    mfa.verify.mockReturnValue(false);
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.confirmMfaSetup("u1", "000000")).rejects.toThrow(/Invalid MFA code/);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("confirmMfaSetup enables MFA once a valid code is supplied", async () => {
    const { prisma, jwt, auditLog, mfa, email } = userMocks({ mfaSecret: "PENDINGSECRET" });
    mfa.verify.mockReturnValue(true);
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    const result = await service.confirmMfaSetup("u1", "123456");

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { mfaEnabled: true } });
    expect(result).toEqual({ mfaEnabled: true });
  });

  test("disableMfa requires a valid code and clears both mfaEnabled and mfaSecret", async () => {
    const { prisma, jwt, auditLog, mfa, email } = userMocks({ mfaEnabled: true, mfaSecret: "ACTIVESECRET" });
    mfa.verify.mockReturnValue(true);
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    const result = await service.disableMfa("u1", "123456");

    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { mfaEnabled: false, mfaSecret: null } });
    expect(result).toEqual({ mfaEnabled: false });
  });

  test("disableMfa rejects when MFA is not currently enabled", async () => {
    const { prisma, jwt, auditLog, mfa, email } = userMocks({ mfaEnabled: false, mfaSecret: null });
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.disableMfa("u1", "123456")).rejects.toThrow(/not currently enabled/);
  });
});

describe("AuthService.inspectInvitation / acceptInvitation", () => {
  function invitationMocks() {
    const { prisma, jwt, auditLog, mfa, email } = makeMocks();
    prisma.organizationInvitation = { findUnique: jest.fn(), update: jest.fn() };
    return { prisma, jwt, auditLog, mfa, email };
  }

  const liveInvitation = {
    id: "inv-1",
    organizationId: "org-1",
    membershipId: "membership-1",
    acceptedAt: null,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    organization: { name: "Acme Ltd" },
    role: { id: "role-1", name: "ACCOUNTANT" },
    invitedBy: { fullName: "Jane Owner" },
    membership: {
      membershipId: "membership-1",
      user: { id: "user-1", email: "new.person@example.com", isActive: true, erasedAt: null, passwordSet: false, isPlatformAdmin: false, isTaxRuleApprover: false },
      role: { id: "role-1", name: "ACCOUNTANT" },
    },
  };

  test.each([
    ["a nonexistent token", null],
    ["an already-accepted invitation", { ...liveInvitation, acceptedAt: new Date() }],
    ["a revoked invitation", { ...liveInvitation, revokedAt: new Date() }],
    ["an expired invitation", { ...liveInvitation, expiresAt: new Date(Date.now() - 1000) }],
  ])("inspectInvitation gives the same generic error for %s (no account enumeration)", async (_label, mockReturn) => {
    const { prisma, jwt, auditLog, mfa, email } = invitationMocks();
    prisma.organizationInvitation.findUnique.mockResolvedValue(mockReturn);
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.inspectInvitation("some-token")).rejects.toThrow(BadRequestException);
  });

  test("inspectInvitation returns a masked email and requiresPassword=true for a brand-new invitee", async () => {
    const { prisma, jwt, auditLog, mfa, email } = invitationMocks();
    prisma.organizationInvitation.findUnique.mockResolvedValue(liveInvitation);
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    const result = await service.inspectInvitation("some-token");

    expect(result.organizationName).toBe("Acme Ltd");
    expect(result.invitedByName).toBe("Jane Owner");
    expect(result.roleName).toBe("ACCOUNTANT");
    expect(result.maskedEmail).not.toBe("new.person@example.com");
    expect(result.maskedEmail).toContain("@example.com");
    expect(result.requiresPassword).toBe(true);
  });

  test("inspectInvitation reports requiresPassword=false for an existing account that already has a password", async () => {
    const { prisma, jwt, auditLog, mfa, email } = invitationMocks();
    prisma.organizationInvitation.findUnique.mockResolvedValue({
      ...liveInvitation,
      membership: { ...liveInvitation.membership, user: { ...liveInvitation.membership.user, passwordSet: true } },
    });
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    const result = await service.inspectInvitation("some-token");
    expect(result.requiresPassword).toBe(false);
  });

  test("acceptInvitation requires a password for a brand-new invitee and rejects a missing one", async () => {
    const { prisma, jwt, auditLog, mfa, email } = invitationMocks();
    prisma.organizationInvitation.findUnique.mockResolvedValue(liveInvitation);
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.acceptInvitation("token", "Full Name", undefined)).rejects.toThrow(BadRequestException);
  });

  test("acceptInvitation sets a real password, flips passwordSet, activates the membership, and returns a session token", async () => {
    const { prisma, jwt, auditLog, mfa, email } = invitationMocks();
    prisma.organizationInvitation.findUnique.mockResolvedValue(liveInvitation);
    prisma.user.update = jest.fn().mockResolvedValue({});
    prisma.organizationUser.update = jest.fn().mockResolvedValue({});
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    const result = await service.acceptInvitation("token", "Corrected Name", "brand-new-password");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { passwordHash: expect.any(String), passwordSet: true, fullName: "Corrected Name" },
    });
    expect(prisma.organizationUser.update).toHaveBeenCalledWith({
      where: { id: "membership-1" },
      data: { status: "ACTIVE", joinedAt: expect.any(Date) },
    });
    expect(prisma.organizationInvitation.update).toHaveBeenCalledWith({ where: { id: "inv-1" }, data: { acceptedAt: expect.any(Date) } });
    expect(result.accessToken).toBe("signed.jwt.token");
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: "ACCEPT_INVITATION", userId: "user-1" }));
  });

  test("acceptInvitation for an EXISTING account (passwordSet=true) ignores any password sent and never touches it", async () => {
    const { prisma, jwt, auditLog, mfa, email } = invitationMocks();
    prisma.organizationInvitation.findUnique.mockResolvedValue({
      ...liveInvitation,
      membership: { ...liveInvitation.membership, user: { ...liveInvitation.membership.user, passwordSet: true } },
    });
    prisma.user.update = jest.fn();
    prisma.organizationUser.update = jest.fn().mockResolvedValue({});
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await service.acceptInvitation("token", undefined, undefined);

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test.each([
    ["an already-accepted invitation", { ...liveInvitation, acceptedAt: new Date() }],
    ["a revoked invitation", { ...liveInvitation, revokedAt: new Date() }],
    ["an expired invitation", { ...liveInvitation, expiresAt: new Date(Date.now() - 1000) }],
    ["a nonexistent token", null],
  ])("acceptInvitation refuses %s with the same generic error", async (_label, mockReturn) => {
    const { prisma, jwt, auditLog, mfa, email } = invitationMocks();
    prisma.organizationInvitation.findUnique.mockResolvedValue(mockReturn);
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.acceptInvitation("token", undefined, "whatever-password")).rejects.toThrow(BadRequestException);
  });

  test("acceptInvitation refuses a deactivated or erased account even with a technically-valid token", async () => {
    const { prisma, jwt, auditLog, mfa, email } = invitationMocks();
    prisma.organizationInvitation.findUnique.mockResolvedValue({
      ...liveInvitation,
      membership: { ...liveInvitation.membership, user: { ...liveInvitation.membership.user, isActive: false } },
    });
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);

    await expect(service.acceptInvitation("token", undefined, "whatever-password")).rejects.toThrow(BadRequestException);
  });
});

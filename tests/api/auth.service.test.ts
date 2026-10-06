import * as bcrypt from "bcrypt";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../../src/api/auth/auth.service";
import { ROLES } from "../../src/api/common/rbac.constants";

function makeMocks() {
  const prisma: any = {
    user: { findUnique: jest.fn(), create: jest.fn() },
    role: { findUnique: jest.fn() },
    organizationUser: { findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
    organization: { create: jest.fn() },
  };
  const jwt: any = { sign: jest.fn(() => "signed.jwt.token") };
  const auditLog: any = { record: jest.fn() };
  return { prisma, jwt, auditLog };
}

describe("AuthService.register", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret-not-for-production";
  });

  test("rejects a duplicate email with ConflictException", async () => {
    const { prisma, jwt, auditLog } = makeMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "existing-user" });
    const service = new AuthService(prisma, jwt, auditLog);

    await expect(
      service.register({ email: "dup@example.com", password: "password1234", fullName: "Dup User", organizationName: "Dup Co" })
    ).rejects.toThrow(ConflictException);
  });

  test("throws if the COMPANY_OWNER role has not been seeded", async () => {
    const { prisma, jwt, auditLog } = makeMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue(null);
    const service = new AuthService(prisma, jwt, auditLog);

    await expect(
      service.register({ email: "new@example.com", password: "password1234", fullName: "New User", organizationName: "New Co" })
    ).rejects.toThrow(/seed-rbac/);
  });

  test("creates organization + user + COMPANY_OWNER membership, hashes the password, and signs a token", async () => {
    const { prisma, jwt, auditLog } = makeMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.role.findUnique.mockResolvedValue({ id: "role-owner", name: ROLES.COMPANY_OWNER });
    prisma.organization.create.mockResolvedValue({ id: "org-1", name: "New Co" });
    prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: "user-1", ...data }));
    prisma.organizationUser.create = jest.fn().mockResolvedValue({ id: "membership-1" });

    const service = new AuthService(prisma, jwt, auditLog);
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
    const { prisma, jwt, auditLog } = makeMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    const service = new AuthService(prisma, jwt, auditLog);

    await expect(service.login({ email: "nobody@example.com", password: "whatever123" })).rejects.toThrow(UnauthorizedException);
  });

  test("rejects a wrong password with UnauthorizedException", async () => {
    const { prisma, jwt, auditLog } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false });
    const service = new AuthService(prisma, jwt, auditLog);

    await expect(service.login({ email: "a@b.com", password: "wrong-password" })).rejects.toThrow(UnauthorizedException);
  });

  test("rejects a deactivated user even with the correct password", async () => {
    const { prisma, jwt, auditLog } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: false, isPlatformAdmin: false });
    const service = new AuthService(prisma, jwt, auditLog);

    await expect(service.login({ email: "a@b.com", password: "correct-password" })).rejects.toThrow(UnauthorizedException);
  });

  test("rejects a user with no active organization membership (unless platform admin)", async () => {
    const { prisma, jwt, auditLog } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false });
    prisma.organizationUser.findFirst.mockResolvedValue(null);
    const service = new AuthService(prisma, jwt, auditLog);

    await expect(service.login({ email: "a@b.com", password: "correct-password" })).rejects.toThrow(UnauthorizedException);
  });

  test("succeeds for a correct password and active membership, returning a signed token scoped to that org/role", async () => {
    const { prisma, jwt, auditLog } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: false });
    prisma.organizationUser.findFirst.mockResolvedValue({
      organizationId: "org-9",
      roleId: "role-9",
      role: { name: ROLES.ACCOUNTANT },
    });
    const service = new AuthService(prisma, jwt, auditLog);

    const result = await service.login({ email: "a@b.com", password: "correct-password" });
    expect(result.accessToken).toBe("signed.jwt.token");
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-9", roleName: ROLES.ACCOUNTANT }));
  });

  test("platform admin can log in with no organization membership at all", async () => {
    const { prisma, jwt, auditLog } = makeMocks();
    const correctHash = await bcrypt.hash("correct-password", 4);
    prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "admin@platform.com", passwordHash: correctHash, isActive: true, isPlatformAdmin: true });
    prisma.organizationUser.findFirst.mockResolvedValue(null);
    const service = new AuthService(prisma, jwt, auditLog);

    const result = await service.login({ email: "admin@platform.com", password: "correct-password" });
    expect(result.accessToken).toBe("signed.jwt.token");
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null, isPlatformAdmin: true }));
  });
});

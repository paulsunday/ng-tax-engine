import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { UsersService } from "../../src/api/users/users.service";

function makeMocks() {
  const prisma: any = {
    user: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    organizationUser: { findMany: jest.fn() },
    auditLog: { findMany: jest.fn() },
  };
  const auditLog: any = { record: jest.fn() };
  const service = new UsersService(prisma, auditLog);
  return { prisma, auditLog, service };
}

describe("UsersService.requestErasure (NDPA/NDPR right to erasure)", () => {
  test("anonymizes personal fields and deactivates the account, never hard-deletes the row", async () => {
    const { service, prisma, auditLog } = makeMocks();
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1", erasedAt: null, email: "real@person.com", fullName: "Real Person" });
    prisma.user.update.mockResolvedValue({});

    const result = await service.requestErasure("user-1");

    expect(result.alreadyErased).toBe(false);
    const updateArgs = prisma.user.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "user-1" });
    expect(updateArgs.data.fullName).not.toBe("Real Person");
    expect(updateArgs.data.email).not.toBe("real@person.com");
    expect(updateArgs.data.isActive).toBe(false);
    expect(updateArgs.data.mfaSecret).toBeNull();
    expect(updateArgs.data.erasedAt).toBeInstanceOf(Date);
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: "ERASURE_REQUESTED", objectId: "user-1" }));
  });

  test("is idempotent — a second request on an already-erased account does not re-update or re-log", async () => {
    const { service, prisma, auditLog } = makeMocks();
    const erasedAt = new Date("2026-01-01");
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1", erasedAt });

    const result = await service.requestErasure("user-1");

    expect(result).toEqual({ erasedAt, alreadyErased: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(auditLog.record).not.toHaveBeenCalled();
  });
});

describe("UsersService.setTaxRuleApprover", () => {
  test("rejects a non-platform-admin caller", async () => {
    const { service } = makeMocks();
    await expect(service.setTaxRuleApprover("user-1", false, "target-1", true)).rejects.toThrow(ForbiddenException);
  });

  test("rejects granting to a user that does not exist", async () => {
    const { service, prisma } = makeMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.setTaxRuleApprover("admin-1", true, "ghost", true)).rejects.toThrow(NotFoundException);
  });

  test("a platform admin can grant tax-rule-approver status, and it is audit-logged", async () => {
    const { service, prisma, auditLog } = makeMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "target-1", isTaxRuleApprover: false });
    prisma.user.update.mockResolvedValue({ id: "target-1", email: "t@example.com", isTaxRuleApprover: true });

    const result = await service.setTaxRuleApprover("admin-1", true, "target-1", true);

    expect(result.isTaxRuleApprover).toBe(true);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "GRANT_TAX_RULE_APPROVER", objectId: "target-1", newValue: { isTaxRuleApprover: true } })
    );
  });

  test("a platform admin can revoke tax-rule-approver status", async () => {
    const { service, prisma, auditLog } = makeMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "target-1", isTaxRuleApprover: true });
    prisma.user.update.mockResolvedValue({ id: "target-1", email: "t@example.com", isTaxRuleApprover: false });

    await service.setTaxRuleApprover("admin-1", true, "target-1", false);

    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: "REVOKE_TAX_RULE_APPROVER" }));
  });
});

describe("UsersService.exportMyData (NDPA/NDPR right of access)", () => {
  test("exports the user's own profile, memberships, and audit history — never passwordHash or mfaSecret", async () => {
    const { service, prisma } = makeMocks();
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      id: "user-1",
      email: "a@b.com",
      fullName: "A B",
      isActive: true,
      mfaEnabled: false,
      isPlatformAdmin: false,
      isTaxRuleApprover: false,
      createdAt: new Date("2026-01-01"),
    });
    prisma.organizationUser.findMany.mockResolvedValue([
      { organization: { id: "org-1", name: "Org One" }, role: { name: "COMPANY_OWNER" }, status: "ACTIVE", joinedAt: new Date("2026-01-01") },
    ]);
    prisma.auditLog.findMany.mockResolvedValue([
      { id: "log-1", organizationId: "org-1", action: "LOGIN", objectType: "User", objectId: "user-1", createdAt: new Date("2026-01-02") },
    ]);

    const result = await service.exportMyData("user-1");

    expect(result.profile).not.toHaveProperty("passwordHash");
    expect(result.profile).not.toHaveProperty("mfaSecret");
    expect(result.organizationMemberships).toEqual([
      { organizationId: "org-1", organizationName: "Org One", roleName: "COMPANY_OWNER", status: "ACTIVE", joinedAt: new Date("2026-01-01") },
    ]);
    expect(result.auditLogHistory).toHaveLength(1);
    expect(prisma.organizationUser.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1" } }));
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-1" } }));
  });
});

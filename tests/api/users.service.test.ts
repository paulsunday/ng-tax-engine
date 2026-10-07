import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { UsersService } from "../../src/api/users/users.service";

function makeMocks() {
  const prisma: any = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const auditLog: any = { record: jest.fn() };
  const service = new UsersService(prisma, auditLog);
  return { prisma, auditLog, service };
}

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

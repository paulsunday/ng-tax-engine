import * as crypto from "crypto";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { OrganizationsService } from "../../src/api/organizations/organizations.service";
import { ROLES } from "../../src/api/common/rbac.constants";

// Generated at test-run time rather than written as a source literal — just long enough to
// satisfy AddMemberDto's @MinLength(10) on the deprecated legacy endpoint's
// temporaryPassword field. Not a real credential; nothing secret-shaped sits in source.
const FAKE_LEGACY_TEMPORARY_PASSWORD = crypto.randomBytes(8).toString("hex");

const ROLE_ROWS: Record<string, { id: string; name: string }> = {
  COMPANY_OWNER: { id: "role-owner", name: ROLES.COMPANY_OWNER },
  COMPANY_ADMIN: { id: "role-admin", name: ROLES.COMPANY_ADMIN },
  ACCOUNTANT: { id: "role-accountant", name: ROLES.ACCOUNTANT },
  FINANCE_MANAGER: { id: "role-finance", name: ROLES.FINANCE_MANAGER },
  PLATFORM_ADMIN: { id: "role-platform", name: ROLES.PLATFORM_ADMIN },
};

// A tiny but real permission universe, just enough to exercise the subset check: ACCOUNTANT
// has fewer keys than FINANCE_MANAGER, COMPANY_OWNER/COMPANY_ADMIN both have everything.
const ROLE_PERMISSIONS: Record<string, string[]> = {
  "role-owner": ["a", "b", "c", "org.users.manage"],
  "role-admin": ["a", "b", "c", "org.users.manage"],
  "role-accountant": ["a", "org.users.manage"],
  "role-finance": ["a", "b", "c", "org.users.manage"],
  "role-platform": ["a", "b", "c", "org.users.manage"],
};

function makeMocks() {
  const prisma: any = {
    role: { findUnique: jest.fn(async ({ where: { name } }: any) => ROLE_ROWS[name] ?? null) },
    user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    organizationUser: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(1), // default: "there's another active owner" unless a test overrides it
    },
    organizationInvitation: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    rolePermission: {
      findMany: jest.fn(async ({ where: { roleId } }: any) => (ROLE_PERMISSIONS[roleId] ?? []).map((key) => ({ permission: { key } }))),
    },
    organization: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "org-1", name: "Acme Ltd" }) },
    $transaction: jest.fn(async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
  };
  const auditLog: any = { record: jest.fn() };
  const email: any = { send: jest.fn().mockResolvedValue({ sent: true }) };
  const service = new OrganizationsService(prisma, auditLog, email);
  return { prisma, auditLog, email, service };
}

describe("OrganizationsService.addMember (deprecated, kept for backward compatibility)", () => {
  test("still creates an ACTIVE membership immediately with a caller-supplied password", async () => {
    const { prisma, service } = makeMocks();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: "new-user", ...data }));
    prisma.organizationUser.create.mockImplementation(async ({ data }: any) => ({ id: "membership-1", ...data }));

    const result = await service.addMember("org-1", "owner-1", {
      email: "legacy@example.com",
      fullName: "Legacy Path",
      temporaryPassword: FAKE_LEGACY_TEMPORARY_PASSWORD,
      roleName: ROLES.ACCOUNTANT,
    });

    expect(result.id).toBe("membership-1");
    expect(prisma.organizationUser.create.mock.calls[0][0].data.roleId).toBe("role-accountant");
  });

  test("still refuses PLATFORM_ADMIN as an organization role on the legacy path too", async () => {
    const { service } = makeMocks();

    await expect(
      service.addMember("org-1", "owner-1", { email: "x@example.com", fullName: "X", temporaryPassword: FAKE_LEGACY_TEMPORARY_PASSWORD, roleName: ROLES.PLATFORM_ADMIN })
    ).rejects.toThrow(ForbiddenException);
  });

  test("refuses a duplicate membership for an existing user", async () => {
    const { prisma, service } = makeMocks();
    prisma.user.findUnique.mockResolvedValue({ id: "existing-user", email: "existing@example.com" });
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "membership-1" });

    await expect(
      service.addMember("org-1", "owner-1", { email: "existing@example.com", fullName: "X", temporaryPassword: FAKE_LEGACY_TEMPORARY_PASSWORD, roleName: ROLES.ACCOUNTANT })
    ).rejects.toThrow(ConflictException);
  });
});

describe("OrganizationsService.inviteMember", () => {
  test("creates a new user (unusable password, passwordSet=false) and an INVITED membership, and emails a token", async () => {
    const { prisma, service, email, auditLog } = makeMocks();
    prisma.user.findFirst.mockResolvedValue(null); // no existing user with this email
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_OWNER, roleId: "role-owner" });
    prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: "new-user", ...data }));
    prisma.organizationUser.create.mockImplementation(async ({ data }: any) => ({ id: "membership-1", ...data }));
    prisma.organizationInvitation.create.mockImplementation(async ({ data }: any) => ({ id: "invitation-1", ...data }));

    const result = await service.inviteMember("org-1", "owner-1", false, { email: "  New.Person@Example.com  ", fullName: "New Person", roleName: ROLES.ACCOUNTANT });

    expect(prisma.user.create.mock.calls[0][0].data.email).toBe("new.person@example.com"); // trimmed + lowercased
    expect(prisma.user.create.mock.calls[0][0].data.passwordSet).toBe(false);
    expect(result.acceptUrl).toBeNull(); // email was "sent" in this mock
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: "new.person@example.com" }));
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: "INVITE_MEMBER" }));
  });

  test("never writes the plaintext token anywhere other than the email body — not the DB row, not the audit log", async () => {
    const { prisma, service, email, auditLog } = makeMocks();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_OWNER, roleId: "role-owner" });
    prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: "new-user", ...data }));
    prisma.organizationUser.create.mockImplementation(async ({ data }: any) => ({ id: "membership-1", ...data }));
    prisma.organizationInvitation.create.mockImplementation(async ({ data }: any) => ({ id: "invitation-1", ...data }));

    await service.inviteMember("org-1", "owner-1", false, { email: "person@example.com", fullName: "Person", roleName: ROLES.ACCOUNTANT });

    const persistedInvitation = prisma.organizationInvitation.create.mock.calls[0][0].data;
    const sentEmailText: string = email.send.mock.calls[0][0].text;
    const rawToken = sentEmailText.split("token=")[1].split(/\s/)[0];

    expect(persistedInvitation.tokenHash).toHaveLength(64); // sha256 hex
    expect(persistedInvitation.tokenHash).not.toBe(rawToken);
    expect(JSON.stringify(persistedInvitation)).not.toContain(rawToken);
    expect(JSON.stringify(auditLog.record.mock.calls[0][0])).not.toContain(rawToken);
  });

  test("refuses an email that is already an ACTIVE member", async () => {
    const { prisma, service } = makeMocks();
    prisma.user.findFirst.mockResolvedValue({ id: "existing-user", isActive: true, erasedAt: null });
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_OWNER, roleId: "role-owner" });
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "membership-1", status: "ACTIVE" });

    await expect(
      service.inviteMember("org-1", "owner-1", false, { email: "existing-user@example.com", fullName: "X", roleName: ROLES.ACCOUNTANT })
    ).rejects.toThrow(ConflictException);
  });

  test("refuses a second invite while one is already pending — directs the caller to resend", async () => {
    const { prisma, service } = makeMocks();
    prisma.user.findFirst.mockResolvedValue({ id: "existing-user", isActive: true, erasedAt: null });
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_OWNER, roleId: "role-owner" });
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "membership-1", status: "INVITED" });
    prisma.organizationInvitation.findFirst.mockResolvedValue({ id: "live-invite" });

    await expect(
      service.inviteMember("org-1", "owner-1", false, { email: "existing-user@example.com", fullName: "X", roleName: ROLES.ACCOUNTANT })
    ).rejects.toThrow(/resend/);
  });

  test("refuses to invite an erased email", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_OWNER, roleId: "role-owner" });
    prisma.user.findFirst.mockResolvedValue({ id: "u1", isActive: true, erasedAt: new Date() });

    await expect(
      service.inviteMember("org-1", "owner-1", false, { email: "erased@example.com", fullName: "X", roleName: ROLES.ACCOUNTANT })
    ).rejects.toThrow(BadRequestException);
  });

  test("refuses to invite a deactivated email", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_OWNER, roleId: "role-owner" });
    prisma.user.findFirst.mockResolvedValue({ id: "u1", isActive: false, erasedAt: null });

    await expect(
      service.inviteMember("org-1", "owner-1", false, { email: "deactivated@example.com", fullName: "X", roleName: ROLES.ACCOUNTANT })
    ).rejects.toThrow(BadRequestException);
  });

  test("a DISABLED membership is re-invited back to INVITED rather than creating a duplicate membership row", async () => {
    const { prisma, service } = makeMocks();
    prisma.user.findFirst.mockResolvedValue({ id: "existing-user", isActive: true, erasedAt: null });
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_OWNER, roleId: "role-owner" });
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "membership-1", status: "DISABLED" });
    prisma.organizationUser.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data }));
    prisma.organizationInvitation.create.mockImplementation(async ({ data }: any) => ({ id: "invitation-1", ...data }));

    await service.inviteMember("org-1", "owner-1", false, { email: "existing-user@example.com", fullName: "X", roleName: ROLES.ACCOUNTANT });

    expect(prisma.organizationUser.create).not.toHaveBeenCalled();
    expect(prisma.organizationUser.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "INVITED" }) }));
  });

  test("PLATFORM_ADMIN can never be granted as an organization role", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_OWNER, roleId: "role-owner" });

    await expect(
      service.inviteMember("org-1", "owner-1", false, { email: "x@example.com", fullName: "X", roleName: ROLES.PLATFORM_ADMIN })
    ).rejects.toThrow(ForbiddenException);
  });

  test("cannot grant a role whose permissions exceed the inviter's own (no privilege escalation)", async () => {
    const { prisma, service } = makeMocks();
    // Acting user is an ACCOUNTANT (fewer permissions than FINANCE_MANAGER in this fixture).
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.ACCOUNTANT, roleId: "role-accountant" });

    await expect(
      service.inviteMember("org-1", "accountant-1", false, { email: "x@example.com", fullName: "X", roleName: ROLES.FINANCE_MANAGER })
    ).rejects.toThrow(ForbiddenException);
  });

  test("only a COMPANY_OWNER can grant COMPANY_OWNER, even though COMPANY_ADMIN has an identical permission set", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_ADMIN, roleId: "role-admin" });

    await expect(
      service.inviteMember("org-1", "admin-1", false, { email: "x@example.com", fullName: "X", roleName: ROLES.COMPANY_OWNER })
    ).rejects.toThrow(/company owner/);
  });

  test("a platform admin bypasses the tenant-RBAC escalation checks entirely", async () => {
    const { prisma, service } = makeMocks();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: "new-user", ...data }));
    prisma.organizationUser.create.mockImplementation(async ({ data }: any) => ({ id: "membership-1", ...data }));
    prisma.organizationInvitation.create.mockImplementation(async ({ data }: any) => ({ id: "invitation-1", ...data }));

    await expect(
      service.inviteMember("org-1", "platform-admin-1", true, { email: "x@example.com", fullName: "X", roleName: ROLES.COMPANY_OWNER })
    ).resolves.toBeDefined();
    expect(prisma.organizationUser.findFirst).not.toHaveBeenCalled(); // never needed the acting membership at all
  });

  test("refuses when the organization has sent too many invitations in the last hour", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_OWNER, roleId: "role-owner" });
    prisma.organizationInvitation.count.mockResolvedValueOnce(20); // org-wide count in the last hour

    await expect(
      service.inviteMember("org-1", "owner-1", false, { email: "x@example.com", fullName: "X", roleName: ROLES.ACCOUNTANT })
    ).rejects.toThrow(/too many invitations/);
  });

  test("refuses when the organization has reached the pending-invitation cap", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_OWNER, roleId: "role-owner" });
    prisma.organizationInvitation.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(100); // orgCount, inviterCount, pendingCount

    await expect(
      service.inviteMember("org-1", "owner-1", false, { email: "x@example.com", fullName: "X", roleName: ROLES.ACCOUNTANT })
    ).rejects.toThrow(/maximum/);
  });

  test("refuses to send in production when FRONTEND_URL is unset, before writing any row", async () => {
    const { prisma, service } = makeMocks();
    const prevEnv = process.env.NODE_ENV;
    const prevUrl = process.env.FRONTEND_URL;
    process.env.NODE_ENV = "production";
    delete process.env.FRONTEND_URL;
    try {
      await expect(
        service.inviteMember("org-1", "owner-1", false, { email: "x@example.com", fullName: "X", roleName: ROLES.ACCOUNTANT })
      ).rejects.toThrow(/FRONTEND_URL/);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevUrl) process.env.FRONTEND_URL = prevUrl;
    }
  });

  test("escapes newlines out of the organization's name before it goes into the email body", async () => {
    const { prisma, service, email } = makeMocks();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_OWNER, roleId: "role-owner" });
    prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: "new-user", ...data }));
    prisma.organizationUser.create.mockImplementation(async ({ data }: any) => ({ id: "membership-1", ...data }));
    prisma.organizationInvitation.create.mockImplementation(async ({ data }: any) => ({ id: "invitation-1", ...data }));
    prisma.organization.findUniqueOrThrow.mockResolvedValue({ id: "org-1", name: "Acme\r\nBcc: attacker@evil.test" });

    await service.inviteMember("org-1", "owner-1", false, { email: "x@example.com", fullName: "X", roleName: ROLES.ACCOUNTANT });

    expect(email.send.mock.calls[0][0].text).not.toMatch(/\r|\n.*Bcc:/);
  });

  test("when the email provider isn't configured, returns the plaintext accept URL to the inviter instead of swallowing it", async () => {
    const { prisma, service, email } = makeMocks();
    email.send.mockResolvedValue({ sent: false });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_OWNER, roleId: "role-owner" });
    prisma.user.create.mockImplementation(async ({ data }: any) => ({ id: "new-user", ...data }));
    prisma.organizationUser.create.mockImplementation(async ({ data }: any) => ({ id: "membership-1", ...data }));
    prisma.organizationInvitation.create.mockImplementation(async ({ data }: any) => ({ id: "invitation-1", ...data }));

    const result = await service.inviteMember("org-1", "owner-1", false, { email: "x@example.com", fullName: "X", roleName: ROLES.ACCOUNTANT });

    expect(result.acceptUrl).toContain("/accept-invite#token=");
  });
});

describe("OrganizationsService.resendInvitation", () => {
  test("issues a new token and expiry on the SAME invitation row, invalidating the old one", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationInvitation.findUnique.mockResolvedValue({ id: "inv-1", organizationId: "org-1", email: "x@example.com", acceptedAt: null, revokedAt: null });
    prisma.organizationInvitation.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data }));

    await service.resendInvitation("org-1", "owner-1", "inv-1");

    expect(prisma.organizationInvitation.create).not.toHaveBeenCalled(); // same row, not a new one
    const updateData = prisma.organizationInvitation.update.mock.calls[0][0].data;
    expect(updateData.tokenHash).toHaveLength(64);
  });

  test("an invitation belonging to a different organization is a 404, not a 403", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationInvitation.findUnique.mockResolvedValue({ id: "inv-1", organizationId: "ORG-VICTIM", email: "x@example.com", acceptedAt: null, revokedAt: null });

    await expect(service.resendInvitation("org-attacker", "attacker-1", "inv-1")).rejects.toThrow(NotFoundException);
  });

  test("refuses to resend an already-accepted invitation", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationInvitation.findUnique.mockResolvedValue({ id: "inv-1", organizationId: "org-1", acceptedAt: new Date(), revokedAt: null });

    await expect(service.resendInvitation("org-1", "owner-1", "inv-1")).rejects.toThrow(BadRequestException);
  });
});

describe("OrganizationsService.revokeInvitation", () => {
  test("revokes the invitation and disables the INVITED membership in the same operation", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationInvitation.findUnique.mockResolvedValue({ id: "inv-1", organizationId: "org-1", membershipId: "membership-1", acceptedAt: null, revokedAt: null });
    prisma.organizationInvitation.update.mockResolvedValue({ id: "inv-1", revokedAt: new Date() });

    await service.revokeInvitation("org-1", "owner-1", "inv-1");

    expect(prisma.organizationUser.updateMany).toHaveBeenCalledWith({ where: { id: "membership-1", status: "INVITED" }, data: { status: "DISABLED" } });
  });

  test("an invitation belonging to a different organization is a 404", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationInvitation.findUnique.mockResolvedValue({ id: "inv-1", organizationId: "ORG-VICTIM" });

    await expect(service.revokeInvitation("org-attacker", "attacker-1", "inv-1")).rejects.toThrow(NotFoundException);
  });

  test("refuses to revoke an invitation that was already accepted", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationInvitation.findUnique.mockResolvedValue({ id: "inv-1", organizationId: "org-1", acceptedAt: new Date(), revokedAt: null });

    await expect(service.revokeInvitation("org-1", "owner-1", "inv-1")).rejects.toThrow(BadRequestException);
  });
});

describe("OrganizationsService.changeMemberRole — escalation and lockout", () => {
  test("a membership belonging to a different organization is a 404", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "m-1", organizationId: "ORG-VICTIM", role: ROLE_ROWS.ACCOUNTANT });

    await expect(service.changeMemberRole("org-attacker", "attacker-1", false, "m-1", ROLES.ACCOUNTANT)).rejects.toThrow(NotFoundException);
  });

  test("refuses to let someone change their own role", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "m-1", organizationId: "org-1", userId: "self-1", role: ROLE_ROWS.ACCOUNTANT });

    await expect(service.changeMemberRole("org-1", "self-1", false, "m-1", ROLES.FINANCE_MANAGER)).rejects.toThrow(ForbiddenException);
  });

  test("a FINANCE_MANAGER-permission role cannot be granted by an ACCOUNTANT (subset check)", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "m-1", organizationId: "org-1", userId: "target-1", role: ROLE_ROWS.ACCOUNTANT });
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.ACCOUNTANT, roleId: "role-accountant" });

    await expect(service.changeMemberRole("org-1", "accountant-1", false, "m-1", ROLES.FINANCE_MANAGER)).rejects.toThrow(ForbiddenException);
  });

  test("only a COMPANY_OWNER can demote another COMPANY_OWNER", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "m-1", organizationId: "org-1", userId: "target-owner", status: "ACTIVE", role: ROLE_ROWS.COMPANY_OWNER });
    // Acting user is a COMPANY_ADMIN — same permission set as COMPANY_OWNER, but must still be refused.
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_ADMIN, roleId: "role-admin" });

    await expect(service.changeMemberRole("org-1", "admin-1", false, "m-1", ROLES.ACCOUNTANT)).rejects.toThrow(/company owner/);
  });

  test("cannot downgrade the organization's only active COMPANY_OWNER, even when performed by another owner", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "m-1", organizationId: "org-1", userId: "target-owner", status: "ACTIVE", role: ROLE_ROWS.COMPANY_OWNER });
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_OWNER, roleId: "role-owner" });
    prisma.organizationUser.count.mockResolvedValue(0); // no OTHER active owners

    await expect(service.changeMemberRole("org-1", "owner-1", false, "m-1", ROLES.ACCOUNTANT)).rejects.toThrow(/only active company owner/);
  });

  test("downgrading a COMPANY_OWNER succeeds when another active owner remains", async () => {
    const { prisma, service, auditLog } = makeMocks();
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "m-1", organizationId: "org-1", userId: "target-owner", status: "ACTIVE", role: ROLE_ROWS.COMPANY_OWNER });
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_OWNER, roleId: "role-owner" });
    prisma.organizationUser.count.mockResolvedValue(1); // one other active owner exists
    prisma.organizationUser.update.mockResolvedValue({ id: "m-1", role: ROLE_ROWS.ACCOUNTANT, user: { id: "target-owner" } });

    await service.changeMemberRole("org-1", "owner-1", false, "m-1", ROLES.ACCOUNTANT);

    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CHANGE_MEMBER_ROLE", previousValue: { roleName: ROLES.COMPANY_OWNER }, newValue: { roleName: ROLES.ACCOUNTANT } })
    );
  });
});

describe("OrganizationsService.disableMember — self-protection and owner lockout", () => {
  test("a membership belonging to a different organization is a 404", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "m-1", organizationId: "ORG-VICTIM", role: ROLE_ROWS.ACCOUNTANT });

    await expect(service.disableMember("org-attacker", "attacker-1", false, "m-1")).rejects.toThrow(NotFoundException);
  });

  test("refuses to let someone disable themselves", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "m-1", organizationId: "org-1", userId: "self-1", status: "ACTIVE", role: ROLE_ROWS.COMPANY_OWNER });

    await expect(service.disableMember("org-1", "self-1", false, "m-1")).rejects.toThrow(ForbiddenException);
  });

  test("refuses to disable the organization's only active COMPANY_OWNER", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "m-1", organizationId: "org-1", userId: "target-owner", status: "ACTIVE", role: ROLE_ROWS.COMPANY_OWNER });
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_OWNER, roleId: "role-owner" });
    prisma.organizationUser.count.mockResolvedValue(0);

    await expect(service.disableMember("org-1", "owner-1", false, "m-1")).rejects.toThrow(/only active company owner/);
  });

  test("only a COMPANY_OWNER can disable another COMPANY_OWNER", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "m-1", organizationId: "org-1", userId: "target-owner", status: "ACTIVE", role: ROLE_ROWS.COMPANY_OWNER });
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "acting-membership", role: ROLE_ROWS.COMPANY_ADMIN, roleId: "role-admin" });
    prisma.organizationUser.count.mockResolvedValue(1);

    await expect(service.disableMember("org-1", "admin-1", false, "m-1")).rejects.toThrow(/company owner/);
  });

  test("refuses to disable a membership that isn't currently ACTIVE", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "m-1", organizationId: "org-1", userId: "target-1", status: "INVITED", role: ROLE_ROWS.ACCOUNTANT });

    await expect(service.disableMember("org-1", "owner-1", false, "m-1")).rejects.toThrow(BadRequestException);
  });

  test("disabling a non-owner succeeds and is audit-logged", async () => {
    const { prisma, service, auditLog } = makeMocks();
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "m-1", organizationId: "org-1", userId: "target-1", status: "ACTIVE", role: ROLE_ROWS.ACCOUNTANT });
    prisma.organizationUser.update.mockResolvedValue({ id: "m-1", status: "DISABLED" });

    await service.disableMember("org-1", "owner-1", false, "m-1");

    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: "DISABLE_MEMBER", newValue: { status: "DISABLED" } }));
  });
});

describe("OrganizationsService.enableMember", () => {
  test("a membership belonging to a different organization is a 404", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "m-1", organizationId: "ORG-VICTIM" });

    await expect(service.enableMember("org-attacker", "attacker-1", "m-1")).rejects.toThrow(NotFoundException);
  });

  test("refuses to enable a membership that isn't currently DISABLED", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "m-1", organizationId: "org-1", status: "ACTIVE" });

    await expect(service.enableMember("org-1", "owner-1", "m-1")).rejects.toThrow(BadRequestException);
  });

  test("flips a DISABLED membership directly back to ACTIVE", async () => {
    const { prisma, service, auditLog } = makeMocks();
    prisma.organizationUser.findUnique.mockResolvedValue({ id: "m-1", organizationId: "org-1", status: "DISABLED" });
    prisma.organizationUser.update.mockResolvedValue({ id: "m-1", status: "ACTIVE" });

    await service.enableMember("org-1", "owner-1", "m-1");

    expect(prisma.organizationUser.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "ACTIVE" } }));
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: "ENABLE_MEMBER" }));
  });
});

describe("OrganizationsService.listMembers", () => {
  test("merges each live invitation onto its membership row rather than listing them separately", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findMany.mockResolvedValue([
      { id: "m-1", status: "INVITED", joinedAt: new Date("2026-01-01"), user: { email: "invitee@example.com", fullName: "Invitee" }, role: { name: ROLES.ACCOUNTANT } },
    ]);
    prisma.organizationInvitation.findMany.mockResolvedValue([
      { id: "inv-1", membershipId: "m-1", createdAt: new Date("2026-01-01"), expiresAt: new Date(Date.now() + 1000), invitedBy: { fullName: "Jane Owner" } },
    ]);

    const result = await service.listMembers("org-1");

    expect(result.members).toEqual([
      expect.objectContaining({
        membershipId: "m-1",
        status: "INVITED",
        invitedByName: "Jane Owner",
        isInviteExpired: false,
        joinedAt: null, // not ACTIVE yet
      }),
    ]);
  });

  test("marks an invitation whose expiry has passed as expired, without changing its membership status", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationUser.findMany.mockResolvedValue([
      { id: "m-1", status: "INVITED", joinedAt: new Date(), user: { email: "x@example.com", fullName: "X" }, role: { name: ROLES.ACCOUNTANT } },
    ]);
    prisma.organizationInvitation.findMany.mockResolvedValue([
      { id: "inv-1", membershipId: "m-1", createdAt: new Date("2020-01-01"), expiresAt: new Date("2020-01-08"), invitedBy: { fullName: "Jane" } },
    ]);

    const result = await service.listMembers("org-1");
    expect(result.members[0].isInviteExpired).toBe(true);
    expect(result.members[0].status).toBe("INVITED");
  });
});

describe("OrganizationsService NDPA hooks", () => {
  test("revokeInvitationsSentBy only touches invitations this user sent that are still pending", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationInvitation.updateMany.mockResolvedValue({ count: 2 });

    const count = await service.revokeInvitationsSentBy("user-1");

    expect(prisma.organizationInvitation.updateMany).toHaveBeenCalledWith({
      where: { invitedByUserId: "user-1", acceptedAt: null, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(count).toBe(2);
  });

  test("listInvitationsForExport returns both sent and received, scoped to this user only", async () => {
    const { prisma, service } = makeMocks();
    prisma.organizationInvitation.findMany.mockResolvedValueOnce([{ id: "sent-1" }]).mockResolvedValueOnce([{ id: "received-1" }]);

    const result = await service.listInvitationsForExport("user-1");

    expect(result.sent).toEqual([{ id: "sent-1" }]);
    expect(result.received).toEqual([{ id: "received-1" }]);
  });
});

import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { IntegrationsService, hashSecret, INTEGRATION_KEY_PREFIX } from "../../src/api/integrations/integrations.service";
import { IntegrationKeyGuard } from "../../src/api/integrations/integration-key.guard";
import { AuthService } from "../../src/api/auth/auth.service";

function makeMocks() {
  const prisma: any = {
    company: { findUniqueOrThrow: jest.fn() },
    integrationConnection: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), update: jest.fn() },
    integrationSsoCode: { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    complianceCalendarEntry: { findMany: jest.fn().mockResolvedValue([]) },
    taxReturn: { findFirst: jest.fn().mockResolvedValue(null) },
    notification: { count: jest.fn().mockResolvedValue(0) },
    user: { findFirst: jest.fn(), findUnique: jest.fn() },
    organizationUser: { findFirst: jest.fn() },
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const auditLog: any = { record: jest.fn() };
  return { prisma, companies, auditLog };
}

const connection = {
  id: "conn-1",
  organizationId: "org-1",
  companyId: "company-1",
  label: "Netwave billing dashboard",
  keyHash: "h",
  keyPrefix: "nwb_abc",
  createdByUserId: "user-1",
  createdAt: new Date(),
  lastUsedAt: new Date(),
  revokedAt: null,
};

describe("IntegrationsService.create", () => {
  test("returns the key once and persists only its hash, never the key itself", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.integrationConnection.create.mockImplementation(async ({ data }: any) => ({ id: "conn-1", createdAt: new Date(), lastUsedAt: null, revokedAt: null, ...data }));
    const service = new IntegrationsService(prisma, companies, auditLog);

    const { key, connection: created } = await service.create("org-1", "company-1", "user-1", "Netwave billing dashboard");

    expect(key.startsWith(INTEGRATION_KEY_PREFIX)).toBe(true);
    const persisted = prisma.integrationConnection.create.mock.calls[0][0].data;
    expect(persisted.keyHash).toBe(hashSecret(key));
    expect(JSON.stringify(persisted)).not.toContain(key);
    expect(created).not.toHaveProperty("keyHash");
  });

  test("refuses to create a connection for a company outside the caller's organization", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    companies.getOneOrThrow.mockRejectedValue(new NotFoundException("Company not found."));
    const service = new IntegrationsService(prisma, companies, auditLog);

    await expect(service.create("org-2", "company-1", "user-9", "x")).rejects.toThrow(NotFoundException);
    expect(prisma.integrationConnection.create).not.toHaveBeenCalled();
  });
});

describe("IntegrationsService.authenticate / IntegrationKeyGuard", () => {
  test("a revoked key is rejected", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.integrationConnection.findUnique.mockResolvedValue({ ...connection, revokedAt: new Date() });
    const service = new IntegrationsService(prisma, companies, auditLog);

    expect(await service.authenticate("nwb_whatever")).toBeNull();
  });

  test("the guard rejects a request with no bearer key", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    const guard = new IntegrationKeyGuard(new IntegrationsService(prisma, companies, auditLog));
    const context: any = { switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }) };

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});

describe("IntegrationsService.summary", () => {
  test("keeps a withheld liability as null rather than reporting zero owed", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.company.findUniqueOrThrow.mockResolvedValue({ id: "company-1", name: "Netwave Tech Labs", vatRegistered: true });
    prisma.taxReturn.findFirst.mockImplementation(async ({ where }: any) =>
      where.taxType === "VAT"
        ? { taxType: "VAT", periodStart: new Date("2026-09-01"), periodEnd: new Date("2026-09-30"), status: "DRAFT", complianceState: "PENDING_RULE_APPROVAL", taxLiabilityNgn: null }
        : null
    );
    const service = new IntegrationsService(prisma, companies, auditLog);

    const summary = await service.summary(connection);

    expect(summary.latestReturns.VAT!.taxLiabilityNgn).toBeNull();
    expect(summary.latestReturns.CIT).toBeNull();
  });
});

describe("IntegrationsService.createSsoLink", () => {
  test("refuses a user who has no active membership in the connected organization", async () => {
    const { prisma, companies, auditLog } = makeMocks();
    prisma.user.findFirst.mockResolvedValue({ id: "user-2", isActive: true, erasedAt: null });
    prisma.organizationUser.findFirst.mockResolvedValue(null);
    const service = new IntegrationsService(prisma, companies, auditLog);

    await expect(service.createSsoLink(connection, "outsider@example.com")).rejects.toThrow(NotFoundException);
    expect(prisma.integrationSsoCode.create).not.toHaveBeenCalled();
  });

  test("puts the code in the URL fragment and stores only its hash", async () => {
    process.env.FRONTEND_URL = "https://tax.netwavetechlabs.com";
    const { prisma, companies, auditLog } = makeMocks();
    prisma.user.findFirst.mockResolvedValue({ id: "user-1", isActive: true, erasedAt: null });
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "m-1" });
    const service = new IntegrationsService(prisma, companies, auditLog);

    const { url } = await service.createSsoLink(connection, "owner@netwave.test");

    const code = url.split("#code=")[1];
    expect(url.startsWith("https://tax.netwavetechlabs.com/sso#code=")).toBe(true);
    expect(prisma.integrationSsoCode.create.mock.calls[0][0].data.codeHash).toBe(hashSecret(code));
  });
});

describe("AuthService.exchangeSsoCode", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret-not-for-production";
  });

  function makeAuth() {
    const { prisma, auditLog } = makeMocks();
    const jwt: any = { sign: jest.fn(() => "signed.jwt.token") };
    const mfa: any = { verify: jest.fn() };
    const email: any = { send: jest.fn() };
    const service = new AuthService(prisma, jwt, auditLog, mfa, email);
    const validCode = { id: "code-1", userId: "user-1", usedAt: null, expiresAt: new Date(Date.now() + 60_000), connection };
    return { prisma, mfa, service, validCode };
  }

  test("issues an organization-scoped token and returns the linked company", async () => {
    const { prisma, service, validCode } = makeAuth();
    prisma.integrationSsoCode.findUnique.mockResolvedValue(validCode);
    prisma.user.findUnique.mockResolvedValue({ id: "user-1", email: "owner@netwave.test", isActive: true, erasedAt: null, mfaEnabled: false });
    prisma.integrationSsoCode.updateMany.mockResolvedValue({ count: 1 });
    prisma.organizationUser.findFirst.mockResolvedValue({ roleId: "role-1", role: { name: "COMPANY_OWNER" } });

    await expect(service.exchangeSsoCode("code")).resolves.toEqual({ accessToken: "signed.jwt.token", companyId: "company-1" });
  });

  test("rejects an expired code", async () => {
    const { prisma, service, validCode } = makeAuth();
    prisma.integrationSsoCode.findUnique.mockResolvedValue({ ...validCode, expiresAt: new Date(Date.now() - 1) });

    await expect(service.exchangeSsoCode("code")).rejects.toThrow(UnauthorizedException);
  });

  test("a code that lost the single-use race is rejected", async () => {
    const { prisma, service, validCode } = makeAuth();
    prisma.integrationSsoCode.findUnique.mockResolvedValue(validCode);
    prisma.user.findUnique.mockResolvedValue({ id: "user-1", isActive: true, erasedAt: null, mfaEnabled: false });
    prisma.integrationSsoCode.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.exchangeSsoCode("code")).rejects.toThrow(UnauthorizedException);
  });

  test("still demands the TOTP code for an MFA-enabled user, without consuming the sign-in code", async () => {
    const { prisma, service, validCode } = makeAuth();
    prisma.integrationSsoCode.findUnique.mockResolvedValue(validCode);
    prisma.user.findUnique.mockResolvedValue({ id: "user-1", isActive: true, erasedAt: null, mfaEnabled: true, mfaSecret: "secret" });

    await expect(service.exchangeSsoCode("code")).rejects.toThrow("MFA code required.");
    expect(prisma.integrationSsoCode.updateMany).not.toHaveBeenCalled();
  });
});

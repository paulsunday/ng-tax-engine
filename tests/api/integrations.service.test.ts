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
    customer: { findUnique: jest.fn() },
    invoice: { findUnique: jest.fn(), update: jest.fn() },
    journalEntry: { findUnique: jest.fn() },
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const customers: any = { create: jest.fn() };
  const invoices: any = { create: jest.fn(), post: jest.fn(), recordPayment: jest.fn() };
  const journal: any = { voidEntry: jest.fn() };
  const auditLog: any = { record: jest.fn() };
  return { prisma, companies, customers, invoices, journal, auditLog };
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
    const { prisma, companies, customers, invoices, journal, auditLog } = makeMocks();
    prisma.integrationConnection.create.mockImplementation(async ({ data }: any) => ({ id: "conn-1", createdAt: new Date(), lastUsedAt: null, revokedAt: null, ...data }));
    const service = new IntegrationsService(prisma, companies, customers, invoices, journal, auditLog);

    const { key, connection: created } = await service.create("org-1", "company-1", "user-1", "Netwave billing dashboard");

    expect(key.startsWith(INTEGRATION_KEY_PREFIX)).toBe(true);
    const persisted = prisma.integrationConnection.create.mock.calls[0][0].data;
    expect(persisted.keyHash).toBe(hashSecret(key));
    expect(JSON.stringify(persisted)).not.toContain(key);
    expect(created).not.toHaveProperty("keyHash");
  });

  test("refuses to create a connection for a company outside the caller's organization", async () => {
    const { prisma, companies, customers, invoices, journal, auditLog } = makeMocks();
    companies.getOneOrThrow.mockRejectedValue(new NotFoundException("Company not found."));
    const service = new IntegrationsService(prisma, companies, customers, invoices, journal, auditLog);

    await expect(service.create("org-2", "company-1", "user-9", "x")).rejects.toThrow(NotFoundException);
    expect(prisma.integrationConnection.create).not.toHaveBeenCalled();
  });
});

describe("IntegrationsService.authenticate / IntegrationKeyGuard", () => {
  test("a revoked key is rejected", async () => {
    const { prisma, companies, customers, invoices, journal, auditLog } = makeMocks();
    prisma.integrationConnection.findUnique.mockResolvedValue({ ...connection, revokedAt: new Date() });
    const service = new IntegrationsService(prisma, companies, customers, invoices, journal, auditLog);

    expect(await service.authenticate("nwb_whatever")).toBeNull();
  });

  test("the guard rejects a request with no bearer key", async () => {
    const { prisma, companies, customers, invoices, journal, auditLog } = makeMocks();
    const guard = new IntegrationKeyGuard(new IntegrationsService(prisma, companies, customers, invoices, journal, auditLog));
    const context: any = { switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }) };

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});

describe("IntegrationsService.summary", () => {
  test("keeps a withheld liability as null rather than reporting zero owed", async () => {
    const { prisma, companies, customers, invoices, journal, auditLog } = makeMocks();
    prisma.company.findUniqueOrThrow.mockResolvedValue({ id: "company-1", name: "Netwave Tech Labs", vatRegistered: true });
    prisma.taxReturn.findFirst.mockImplementation(async ({ where }: any) =>
      where.taxType === "VAT"
        ? { taxType: "VAT", periodStart: new Date("2026-09-01"), periodEnd: new Date("2026-09-30"), status: "DRAFT", complianceState: "PENDING_RULE_APPROVAL", taxLiabilityNgn: null }
        : null
    );
    const service = new IntegrationsService(prisma, companies, customers, invoices, journal, auditLog);

    const summary = await service.summary(connection);

    expect(summary.latestReturns.VAT!.taxLiabilityNgn).toBeNull();
    expect(summary.latestReturns.CIT).toBeNull();
  });

  test("response shape contract: top-level keys are unchanged by the invitations feature — tenant-billing depends on this exact shape", async () => {
    const { prisma, companies, customers, invoices, journal, auditLog } = makeMocks();
    prisma.company.findUniqueOrThrow.mockResolvedValue({ id: "company-1", name: "Netwave Tech Labs", vatRegistered: true });
    const service = new IntegrationsService(prisma, companies, customers, invoices, journal, auditLog);

    const summary = await service.summary(connection);

    expect(Object.keys(summary).sort()).toEqual(
      ["company", "overdueCount", "upcomingDeadlines", "latestReturns", "unreadNotifications", "appUrl", "generatedAt"].sort()
    );
    expect(Object.keys(summary.company).sort()).toEqual(["id", "name", "vatRegistered"].sort());
  });
});

describe("IntegrationsService.createSsoLink", () => {
  test("refuses a user who has no active membership in the connected organization", async () => {
    const { prisma, companies, customers, invoices, journal, auditLog } = makeMocks();
    prisma.user.findFirst.mockResolvedValue({ id: "user-2", isActive: true, erasedAt: null });
    prisma.organizationUser.findFirst.mockResolvedValue(null);
    const service = new IntegrationsService(prisma, companies, customers, invoices, journal, auditLog);

    await expect(service.createSsoLink(connection, "outsider@example.com")).rejects.toThrow(NotFoundException);
    expect(prisma.integrationSsoCode.create).not.toHaveBeenCalled();
  });

  test("the live DB query itself is scoped to status: ACTIVE — an INVITED or DISABLED membership is never a match, same failure as no membership at all", async () => {
    const { prisma, companies, customers, invoices, journal, auditLog } = makeMocks();
    prisma.user.findFirst.mockResolvedValue({ id: "user-2", isActive: true, erasedAt: null });
    // This mock simulates what the real `where: { status: "ACTIVE" }` filter in
    // createSsoLink would return for an INVITED/DISABLED membership: nothing.
    prisma.organizationUser.findFirst.mockResolvedValue(null);
    const service = new IntegrationsService(prisma, companies, customers, invoices, journal, auditLog);

    await expect(service.createSsoLink(connection, "invited-or-disabled@example.com")).rejects.toThrow(NotFoundException);
    expect(prisma.organizationUser.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "ACTIVE" }) })
    );
  });

  test("puts the code in the URL fragment and stores only its hash", async () => {
    process.env.FRONTEND_URL = "https://tax.netwavetechlabs.com";
    const { prisma, companies, customers, invoices, journal, auditLog } = makeMocks();
    prisma.user.findFirst.mockResolvedValue({ id: "user-1", isActive: true, erasedAt: null });
    prisma.organizationUser.findFirst.mockResolvedValue({ id: "m-1" });
    const service = new IntegrationsService(prisma, companies, customers, invoices, journal, auditLog);

    const { url } = await service.createSsoLink(connection, "owner@netwave.test");

    const code = url.split("#code=")[1];
    expect(url.startsWith("https://tax.netwavetechlabs.com/sso#code=")).toBe(true);
    expect(prisma.integrationSsoCode.create.mock.calls[0][0].data.codeHash).toBe(hashSecret(code));
  });
});

describe("IntegrationsService.syncSubscriberInvoice", () => {
  const paymentCapturedInput = {
    externalCustomerId: "ext-cust-1",
    customerName: "Jane Subscriber",
    customerPhone: "08012345678",
    customerEmail: "jane@example.com",
    orderReference: "NW-1001",
    description: "PPPoE — 1 Month",
    amountNgn: 5000,
    paidAt: "2026-10-18T00:00:00.000Z",
    eventType: "PAYMENT_CAPTURED" as const,
  };

  test("creates a new customer by externalRef when none exists yet", async () => {
    const { prisma, companies, customers, invoices, journal, auditLog } = makeMocks();
    prisma.customer.findUnique.mockResolvedValue(null);
    customers.create.mockResolvedValue({ id: "customer-1" });
    prisma.invoice.findUnique.mockResolvedValue(null);
    invoices.create.mockResolvedValue({ id: "invoice-draft" });
    invoices.post.mockResolvedValue({ id: "invoice-draft" });
    invoices.recordPayment.mockResolvedValue({ id: "invoice-draft" });
    const service = new IntegrationsService(prisma, companies, customers, invoices, journal, auditLog);

    await service.syncSubscriberInvoice(connection, paymentCapturedInput);

    expect(customers.create).toHaveBeenCalledWith(
      "org-1",
      "company-1",
      expect.objectContaining({ name: "Jane Subscriber", externalRef: "ext-cust-1" })
    );
  });

  test("reuses the existing customer by externalRef on a second order — never creates a duplicate", async () => {
    const { prisma, companies, customers, invoices, journal, auditLog } = makeMocks();
    prisma.customer.findUnique.mockResolvedValue({ id: "customer-1" });
    prisma.invoice.findUnique.mockResolvedValue(null);
    invoices.create.mockResolvedValue({ id: "invoice-draft" });
    invoices.post.mockResolvedValue({ id: "invoice-draft" });
    invoices.recordPayment.mockResolvedValue({ id: "invoice-draft" });
    const service = new IntegrationsService(prisma, companies, customers, invoices, journal, auditLog);

    await service.syncSubscriberInvoice(connection, paymentCapturedInput);

    expect(customers.create).not.toHaveBeenCalled();
    expect(invoices.create).toHaveBeenCalledWith("org-1", "company-1", connection.createdByUserId, expect.objectContaining({ customerId: "customer-1" }));
  });

  test("PAYMENT_CAPTURED creates, posts, and records payment against the invoice in one call", async () => {
    const { prisma, companies, customers, invoices, journal, auditLog } = makeMocks();
    prisma.customer.findUnique.mockResolvedValue({ id: "customer-1" });
    prisma.invoice.findUnique.mockResolvedValue(null);
    invoices.create.mockResolvedValue({ id: "invoice-draft" });
    invoices.post.mockResolvedValue({ id: "invoice-posted" });
    invoices.recordPayment.mockResolvedValue({ id: "invoice-paid" });
    const service = new IntegrationsService(prisma, companies, customers, invoices, journal, auditLog);

    const result = await service.syncSubscriberInvoice(connection, paymentCapturedInput);

    expect(invoices.create).toHaveBeenCalledWith(
      "org-1",
      "company-1",
      connection.createdByUserId,
      expect.objectContaining({ invoiceNumber: "NW-1001", items: [expect.objectContaining({ unitPriceNgn: 5000, vatRate: 0 })] })
    );
    expect(invoices.post).toHaveBeenCalledWith("org-1", "company-1", connection.createdByUserId, "invoice-draft");
    expect(invoices.recordPayment).toHaveBeenCalledWith("org-1", "company-1", connection.createdByUserId, "invoice-posted", 5000, expect.any(Date), "EXTERNAL_SYNC", "NW-1001");
    expect(result).toEqual({ synced: true, invoiceId: "invoice-paid", customerId: "customer-1" });
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ action: "SYNC_SUBSCRIBER_INVOICE" }));
  });

  test("is idempotent: the same orderReference synced twice never creates a second invoice", async () => {
    const { prisma, companies, customers, invoices, journal, auditLog } = makeMocks();
    prisma.customer.findUnique.mockResolvedValue({ id: "customer-1" });
    prisma.invoice.findUnique.mockResolvedValue({ id: "already-synced-invoice" });
    const service = new IntegrationsService(prisma, companies, customers, invoices, journal, auditLog);

    const result = await service.syncSubscriberInvoice(connection, paymentCapturedInput);

    expect(invoices.create).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: false, reason: "ALREADY_SYNCED", invoiceId: "already-synced-invoice", customerId: "customer-1" });
  });

  test("REFUND_ISSUED voids both the invoice's posting and its payment's posting", async () => {
    const { prisma, companies, customers, invoices, journal, auditLog } = makeMocks();
    prisma.customer.findUnique.mockResolvedValue({ id: "customer-1" });
    prisma.invoice.findUnique.mockResolvedValue({
      id: "invoice-1",
      journalEntryId: "je-invoice",
      payments: [{ journalEntryId: "je-payment" }],
    });
    prisma.journalEntry.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, status: "POSTED" }));
    prisma.invoice.update.mockResolvedValue({});
    const service = new IntegrationsService(prisma, companies, customers, invoices, journal, auditLog);

    const result = await service.syncSubscriberInvoice(connection, { ...paymentCapturedInput, eventType: "REFUND_ISSUED" });

    expect(journal.voidEntry).toHaveBeenCalledWith("org-1", "company-1", connection.createdByUserId, "je-invoice", expect.any(String));
    expect(journal.voidEntry).toHaveBeenCalledWith("org-1", "company-1", connection.createdByUserId, "je-payment", expect.any(String));
    expect(prisma.invoice.update).toHaveBeenCalledWith({ where: { id: "invoice-1" }, data: { status: "VOID" } });
    expect(result.synced).toBe(true);
  });

  test("REFUND_ISSUED for an invoice that was never synced is a no-op, not an error", async () => {
    const { prisma, companies, customers, invoices, journal, auditLog } = makeMocks();
    prisma.customer.findUnique.mockResolvedValue({ id: "customer-1" });
    prisma.invoice.findUnique.mockResolvedValue(null);
    const service = new IntegrationsService(prisma, companies, customers, invoices, journal, auditLog);

    const result = await service.syncSubscriberInvoice(connection, { ...paymentCapturedInput, eventType: "REFUND_ISSUED" });

    expect(journal.voidEntry).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: false, reason: "NOTHING_TO_REVERSE", customerId: "customer-1" });
  });

  test("REFUND_ISSUED is idempotent: a second refund event for an already-voided entry does not re-void it", async () => {
    const { prisma, companies, customers, invoices, journal, auditLog } = makeMocks();
    prisma.customer.findUnique.mockResolvedValue({ id: "customer-1" });
    prisma.invoice.findUnique.mockResolvedValue({
      id: "invoice-1",
      journalEntryId: "je-invoice",
      payments: [{ journalEntryId: "je-payment" }],
    });
    prisma.journalEntry.findUnique.mockImplementation(async ({ where }: any) => ({ id: where.id, status: "VOID" }));
    const service = new IntegrationsService(prisma, companies, customers, invoices, journal, auditLog);

    const result = await service.syncSubscriberInvoice(connection, { ...paymentCapturedInput, eventType: "REFUND_ISSUED" });

    expect(journal.voidEntry).not.toHaveBeenCalled();
    expect(prisma.invoice.update).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: false, reason: "ALREADY_REVERSED", invoiceId: "invoice-1", customerId: "customer-1" });
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

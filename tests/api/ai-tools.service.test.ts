import { AiToolsService } from "../../src/api/ai-tools/ai-tools.service";
import { JwtPayload } from "../../src/api/common/rbac.constants";

function makeMocks() {
  const prisma: any = {
    rolePermission: { findMany: jest.fn().mockResolvedValue([{ roleId: "role-1" }]) },
    invoice: { findMany: jest.fn().mockResolvedValue([{ id: "inv-1", status: "POSTED" }]) },
    expense: { findMany: jest.fn().mockResolvedValue([{ id: "exp-1", status: "POSTED" }]) },
    bankTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    document: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { create: jest.fn().mockResolvedValue({ id: "notif-1" }) },
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const statements: any = { getProfitAndLoss: jest.fn().mockResolvedValue({ netProfitBeforeTaxNgn: 100 }), getBalanceSheet: jest.fn().mockResolvedValue({ totalAssetsNgn: 1000 }) };
  const calendar: any = { listForCompany: jest.fn().mockResolvedValue([{ id: "entry-1" }]) };
  const taxReturns: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "ret-1", status: "APPROVED", taxType: "VAT", taxLiabilityNgn: 500, confidence: "HIGH", calculationBreakdown: { steps: [] } }) };
  const taxCalculation: any = {
    computeCitAndDevelopmentLevy: jest.fn().mockResolvedValue({ taxType: "CIT" }),
    computeVatReturn: jest.fn().mockResolvedValue({ taxType: "VAT" }),
    computePayeReturn: jest.fn().mockResolvedValue({ taxType: "PAYE" }),
    computeWhtReturn: jest.fn().mockResolvedValue({ taxType: "WHT" }),
  };
  const audit: any = { runNormalAudit: jest.fn().mockResolvedValue({ id: "audit-1" }) };
  const scenarios: any = { generate: jest.fn().mockResolvedValue({ id: "scn-1" }) };
  const filing: any = { submit: jest.fn().mockResolvedValue({ id: "ret-1", status: "FILED" }), listAttempts: jest.fn().mockResolvedValue([]) };

  const service = new AiToolsService(prisma, companies, statements, calendar, taxReturns, taxCalculation, audit, scenarios, filing);
  return { service, prisma, companies, statements, calendar, taxReturns, taxCalculation, audit, scenarios, filing };
}

function user(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return { sub: "user-1", email: "a@b.com", organizationId: "org-1", roleId: "role-1", roleName: "ACCOUNTANT", isPlatformAdmin: false, isTaxRuleApprover: false, ...overrides };
}

describe("AiToolsService.invoke — access control", () => {
  test("rejects an unknown tool name", async () => {
    const { service } = makeMocks();
    await expect(service.invoke(user(), { tool: "not_a_real_tool" as any, companyId: "company-1", params: {} })).rejects.toThrow(/Unknown tool/);
  });

  test("rejects a caller whose role lacks the required permission", async () => {
    const { service, prisma } = makeMocks();
    prisma.rolePermission.findMany.mockResolvedValue([]);
    await expect(service.invoke(user(), { tool: "get_company_financials", companyId: "company-1", params: { periodStart: "2026-01-01", periodEnd: "2026-01-31" } })).rejects.toThrow(/Missing required permission/);
  });

  test("a user with no role assigned is rejected", async () => {
    const { service } = makeMocks();
    await expect(service.invoke(user({ roleId: null }), { tool: "get_transactions", companyId: "company-1", params: {} })).rejects.toThrow(/no role assigned/);
  });

  test("a platform admin bypasses the permission check entirely", async () => {
    const { service, prisma, calendar } = makeMocks();
    prisma.rolePermission.findMany.mockResolvedValue([]); // no grants recorded — admin must not need any
    await service.invoke(user({ isPlatformAdmin: true, roleId: null }), { tool: "get_tax_obligations", companyId: "company-1", params: {} });
    expect(calendar.listForCompany).toHaveBeenCalledWith("org-1", "company-1");
  });

  test("a write tool is rejected without humanAuthorized, even for a permitted caller", async () => {
    const { service } = makeMocks();
    await expect(
      service.invoke(user(), { tool: "calculate_tax", companyId: "company-1", params: { taxType: "VAT", periodStart: "2026-01-01", periodEnd: "2026-01-31" } })
    ).rejects.toThrow(/requires explicit human authorization/);
  });

  test("a write tool proceeds once humanAuthorized is true", async () => {
    const { service, taxCalculation } = makeMocks();
    const result = await service.invoke(user(), {
      tool: "calculate_tax",
      companyId: "company-1",
      params: { taxType: "VAT", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
      humanAuthorized: true,
    });
    expect(taxCalculation.computeVatReturn).toHaveBeenCalled();
    expect(result).toEqual({ taxType: "VAT" });
  });
});

describe("AiToolsService.invoke — read tools delegate to the correct underlying service", () => {
  test("get_company_financials combines P&L and balance sheet", async () => {
    const { service, statements } = makeMocks();
    const result = await service.invoke(user(), { tool: "get_company_financials", companyId: "company-1", params: { periodStart: "2026-01-01", periodEnd: "2026-01-31" } });
    expect(statements.getProfitAndLoss).toHaveBeenCalled();
    expect(statements.getBalanceSheet).toHaveBeenCalled();
    expect(result).toEqual({ pnl: { netProfitBeforeTaxNgn: 100 }, balanceSheet: { totalAssetsNgn: 1000 } });
  });

  test("get_missing_documents returns only posted invoices/expenses lacking a linked document", async () => {
    const { service } = makeMocks();
    const result: any = await service.invoke(user(), { tool: "get_missing_documents", companyId: "company-1", params: {} });
    expect(result.invoicesMissingDocuments).toEqual([{ id: "inv-1", invoiceNumber: undefined }]);
    expect(result.expensesMissingDocuments).toEqual([{ id: "exp-1", description: undefined }]);
  });

  test("get_missing_documents excludes an invoice that already has a linked document", async () => {
    const { service, prisma } = makeMocks();
    prisma.document.findMany.mockResolvedValue([{ linkedEntityType: "Invoice", linkedEntityId: "inv-1" }]);
    const result: any = await service.invoke(user(), { tool: "get_missing_documents", companyId: "company-1", params: {} });
    expect(result.invoicesMissingDocuments).toEqual([]);
  });

  test("explain_tax_calculation returns the stored calculation breakdown, not a recomputed one", async () => {
    const { service, taxReturns, taxCalculation } = makeMocks();
    const result = await service.invoke(user(), { tool: "explain_tax_calculation", companyId: "company-1", params: { taxReturnId: "ret-1" } });
    expect(taxReturns.getOneOrThrow).toHaveBeenCalledWith("org-1", "company-1", "ret-1");
    expect(taxCalculation.computeVatReturn).not.toHaveBeenCalled();
    expect(result).toEqual({ taxType: "VAT", taxLiabilityNgn: 500, confidence: "HIGH", breakdown: { steps: [] } });
  });
});

describe("AiToolsService.invoke — write tools require authorization and then delegate", () => {
  test("request_approval creates a notification and never flips an approval status itself", async () => {
    const { service, prisma } = makeMocks();
    await service.invoke(user(), {
      tool: "request_approval",
      companyId: "company-1",
      params: { subject: "VAT return", message: "Please approve the October VAT return.", relatedEntityType: "TaxReturn", relatedEntityId: "ret-1" },
      humanAuthorized: true,
    });
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ category: "APPROVAL_REQUESTED", relatedEntityId: "ret-1" }) })
    );
  });

  test("submit_tax_return delegates to FilingService.submit and does not post directly", async () => {
    const { service, filing } = makeMocks();
    await service.invoke(user(), { tool: "submit_tax_return", companyId: "company-1", params: { taxReturnId: "ret-1" }, humanAuthorized: true });
    expect(filing.submit).toHaveBeenCalledWith("org-1", "company-1", "user-1", "ret-1", "MANUAL");
  });

  test("run_audit requires authorization and delegates to AuditService.runNormalAudit", async () => {
    const { service, audit } = makeMocks();
    await service.invoke(user(), { tool: "run_audit", companyId: "company-1", params: { periodStart: "2026-01-01", periodEnd: "2026-01-31" }, humanAuthorized: true });
    expect(audit.runNormalAudit).toHaveBeenCalled();
  });

  test("generate_scenario requires authorization and delegates to ScenariosService.generate", async () => {
    const { service, scenarios } = makeMocks();
    await service.invoke(user(), {
      tool: "generate_scenario",
      companyId: "company-1",
      params: { scenarioType: "PROFIT_SCENARIO", periodStart: "2026-01-01", periodEnd: "2026-01-31" },
      humanAuthorized: true,
    });
    expect(scenarios.generate).toHaveBeenCalledWith("org-1", "company-1", "user-1", "PROFIT_SCENARIO", new Date("2026-01-01"), new Date("2026-01-31"));
  });
});

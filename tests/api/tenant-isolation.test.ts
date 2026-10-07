/**
 * Dedicated IDOR / cross-tenant-access test suite (production-readiness mandate §10).
 * Every org-scoped service in this app funnels through CompaniesService.getOneOrThrow —
 * these tests prove that chokepoint actually holds: a caller from Org A can never read or
 * mutate Org B's data by guessing/knowing a companyId, and critically, the failure mode is
 * IDENTICAL whether the companyId doesn't exist at all or belongs to another tenant (never
 * leaking which case it is).
 */
import { NotFoundException } from "@nestjs/common";
import { CompaniesService } from "../../src/api/companies/companies.service";
import { InvoicesService } from "../../src/api/invoices/invoices.service";
import { TaxReturnsService } from "../../src/api/tax-returns/tax-returns.service";

describe("CompaniesService.getOneOrThrow — the core tenant-isolation chokepoint", () => {
  function makeMocks() {
    const prisma: any = { company: { findUnique: jest.fn() } };
    const auditLog: any = { record: jest.fn() };
    return { prisma, auditLog };
  }

  test("a company belonging to a different organization is rejected identically to one that doesn't exist at all", async () => {
    const { prisma, auditLog } = makeMocks();
    const service = new CompaniesService(prisma, auditLog);

    prisma.company.findUnique.mockResolvedValue({ id: "company-victim", organizationId: "org-victim" });
    let crossTenantError: unknown;
    try {
      await service.getOneOrThrow("org-attacker", "company-victim");
    } catch (e) {
      crossTenantError = e;
    }

    prisma.company.findUnique.mockResolvedValue(null);
    let notFoundError: unknown;
    try {
      await service.getOneOrThrow("org-attacker", "company-does-not-exist");
    } catch (e) {
      notFoundError = e;
    }

    expect(crossTenantError).toBeInstanceOf(NotFoundException);
    expect(notFoundError).toBeInstanceOf(NotFoundException);
    expect((crossTenantError as NotFoundException).message).toBe((notFoundError as NotFoundException).message);
  });

  test("a company belonging to the caller's own organization is returned normally", async () => {
    const { prisma, auditLog } = makeMocks();
    const service = new CompaniesService(prisma, auditLog);
    prisma.company.findUnique.mockResolvedValue({ id: "company-mine", organizationId: "org-mine" });

    const result = await service.getOneOrThrow("org-mine", "company-mine");
    expect(result.id).toBe("company-mine");
  });
});

describe("Downstream services inherit tenant isolation through CompaniesService (IDOR, not just a unit-test of the chokepoint itself)", () => {
  test("InvoicesService.getOneOrThrow refuses an invoice beneath a company owned by another tenant", async () => {
    const prisma: any = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: "company-victim", organizationId: "org-victim" }) },
      invoice: { findUnique: jest.fn() },
    };
    const auditLog: any = { record: jest.fn() };
    const companies = new CompaniesService(prisma, auditLog);
    const customers: any = {};
    const accounts: any = {};
    const journal: any = {};
    const invoices = new InvoicesService(prisma, companies, customers, accounts, journal, auditLog);

    await expect(invoices.getOneOrThrow("org-attacker", "company-victim", "invoice-1")).rejects.toThrow(NotFoundException);
    // The attack is stopped at the company-ownership check — the invoice table is never even queried.
    expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
  });

  test("TaxReturnsService.getOneOrThrow refuses a tax return beneath a company owned by another tenant", async () => {
    const prisma: any = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: "company-victim", organizationId: "org-victim" }) },
      taxReturn: { findUnique: jest.fn() },
    };
    const auditLog: any = { record: jest.fn() };
    const companies = new CompaniesService(prisma, auditLog);
    const taxReturns = new TaxReturnsService(prisma, companies, auditLog);

    await expect(taxReturns.getOneOrThrow("org-attacker", "company-victim", "return-1")).rejects.toThrow(NotFoundException);
    expect(prisma.taxReturn.findUnique).not.toHaveBeenCalled();
  });

  test("a tax return that DOES belong to a company the caller can see, but was created under a DIFFERENT company, is still rejected", async () => {
    // Guards against a subtler IDOR: companyId checks out, but the resource itself (by its
    // own companyId column) belongs to someone else — e.g. a return ID guessed/reused
    // across companies within query params that don't match the resource's real owner.
    const prisma: any = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: "company-mine", organizationId: "org-mine" }) },
      taxReturn: { findUnique: jest.fn().mockResolvedValue({ id: "return-1", companyId: "company-someone-elses" }) },
    };
    const auditLog: any = { record: jest.fn() };
    const companies = new CompaniesService(prisma, auditLog);
    const taxReturns = new TaxReturnsService(prisma, companies, auditLog);

    await expect(taxReturns.getOneOrThrow("org-mine", "company-mine", "return-1")).rejects.toThrow(NotFoundException);
  });
});

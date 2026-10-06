import { NotFoundException } from "@nestjs/common";
import { CompaniesService } from "../../src/api/companies/companies.service";

function makeMocks() {
  const prisma: any = { company: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() } };
  const auditLog: any = { record: jest.fn() };
  return { prisma, auditLog };
}

describe("CompaniesService tenant isolation (brief §4)", () => {
  test("getOneOrThrow returns the company when it belongs to the caller's organization", async () => {
    const { prisma, auditLog } = makeMocks();
    prisma.company.findUnique.mockResolvedValue({ id: "c1", organizationId: "org-A", name: "Mine Ltd" });
    const service = new CompaniesService(prisma, auditLog);

    const result = await service.getOneOrThrow("org-A", "c1");
    expect(result.name).toBe("Mine Ltd");
  });

  test("getOneOrThrow throws NotFoundException when the company belongs to a DIFFERENT organization", async () => {
    const { prisma, auditLog } = makeMocks();
    prisma.company.findUnique.mockResolvedValue({ id: "c1", organizationId: "org-B", name: "Theirs Ltd" });
    const service = new CompaniesService(prisma, auditLog);

    await expect(service.getOneOrThrow("org-A", "c1")).rejects.toThrow(NotFoundException);
  });

  test("getOneOrThrow and 'does not exist' produce the identical error (never confirm cross-tenant existence)", async () => {
    const { prisma: prismaA, auditLog: auditA } = makeMocks();
    prismaA.company.findUnique.mockResolvedValue(null);
    const serviceA = new CompaniesService(prismaA, auditA);

    const { prisma: prismaB, auditLog: auditB } = makeMocks();
    prismaB.company.findUnique.mockResolvedValue({ id: "c1", organizationId: "org-OTHER", name: "Theirs Ltd" });
    const serviceB = new CompaniesService(prismaB, auditB);

    let errA: any, errB: any;
    try {
      await serviceA.getOneOrThrow("org-A", "nonexistent");
    } catch (e) {
      errA = e;
    }
    try {
      await serviceB.getOneOrThrow("org-A", "c1");
    } catch (e) {
      errB = e;
    }
    expect(errA).toBeInstanceOf(NotFoundException);
    expect(errB).toBeInstanceOf(NotFoundException);
    expect(errA.message).toBe(errB.message);
  });

  test("listForOrganization only ever queries by the caller's organizationId", async () => {
    const { prisma, auditLog } = makeMocks();
    prisma.company.findMany.mockResolvedValue([]);
    const service = new CompaniesService(prisma, auditLog);

    await service.listForOrganization("org-A");
    expect(prisma.company.findMany).toHaveBeenCalledWith({ where: { organizationId: "org-A" } });
  });

  test("create() stamps the new company with the caller's organizationId and writes an audit log entry", async () => {
    const { prisma, auditLog } = makeMocks();
    prisma.company.create.mockImplementation(async ({ data }: any) => ({ id: "new-co", ...data }));
    const service = new CompaniesService(prisma, auditLog);

    const dto = {
      name: "Acme Ltd",
      incorporationDate: "2020-01-01",
      accountingYearEnd: "12-31",
      headOfficeStateCode: "EN",
    };
    const created = await service.create("org-A", "user-1", dto as any);

    expect(created.organizationId).toBe("org-A");
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-A", userId: "user-1", action: "CREATE", objectType: "Company" })
    );
  });
});

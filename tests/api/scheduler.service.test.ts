import { SchedulerService } from "../../src/api/scheduler/scheduler.service";

function makeMocks() {
  const prisma: any = { company: { findMany: jest.fn() } };
  const calendar: any = { refreshOverdueStatus: jest.fn().mockResolvedValue(undefined) };
  const notifications: any = { generateComplianceReminders: jest.fn().mockResolvedValue({ createdCount: 0 }) };
  return { prisma, calendar, notifications };
}

describe("SchedulerService.runDailyComplianceSweep", () => {
  test("refreshes overdue status and generates reminders for every company across every tenant", async () => {
    const { prisma, calendar, notifications } = makeMocks();
    prisma.company.findMany.mockResolvedValue([
      { id: "company-1", organizationId: "org-1" },
      { id: "company-2", organizationId: "org-2" },
    ]);
    const service = new SchedulerService(prisma, calendar, notifications);

    const result = await service.runDailyComplianceSweep();

    expect(calendar.refreshOverdueStatus).toHaveBeenCalledWith("org-1", "company-1");
    expect(calendar.refreshOverdueStatus).toHaveBeenCalledWith("org-2", "company-2");
    expect(notifications.generateComplianceReminders).toHaveBeenCalledWith("org-1", "company-1");
    expect(notifications.generateComplianceReminders).toHaveBeenCalledWith("org-2", "company-2");
    expect(result).toEqual({ companiesProcessed: 2, failures: 0 });
  });

  test("a failure in one company is isolated and does not stop the sweep for the rest", async () => {
    const { prisma, calendar, notifications } = makeMocks();
    prisma.company.findMany.mockResolvedValue([
      { id: "company-bad", organizationId: "org-1" },
      { id: "company-good", organizationId: "org-2" },
    ]);
    calendar.refreshOverdueStatus.mockImplementation(async (_orgId: string, companyId: string) => {
      if (companyId === "company-bad") throw new Error("boom");
    });
    const service = new SchedulerService(prisma, calendar, notifications);

    const result = await service.runDailyComplianceSweep();

    expect(notifications.generateComplianceReminders).toHaveBeenCalledWith("org-2", "company-good");
    expect(notifications.generateComplianceReminders).not.toHaveBeenCalledWith("org-1", "company-bad");
    expect(result).toEqual({ companiesProcessed: 2, failures: 1 });
  });

  test("zero companies is a no-op, not an error", async () => {
    const { prisma, calendar, notifications } = makeMocks();
    prisma.company.findMany.mockResolvedValue([]);
    const service = new SchedulerService(prisma, calendar, notifications);

    const result = await service.runDailyComplianceSweep();

    expect(result).toEqual({ companiesProcessed: 0, failures: 0 });
    expect(calendar.refreshOverdueStatus).not.toHaveBeenCalled();
  });
});

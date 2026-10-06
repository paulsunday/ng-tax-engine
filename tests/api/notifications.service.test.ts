import { NotificationsService } from "../../src/api/notifications/notifications.service";

function makeMocks() {
  const prisma: any = {
    company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "company-1", name: "Netwave Technologies Ltd" }) },
    complianceCalendarEntry: { findMany: jest.fn() },
    notification: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  return { prisma, companies };
}

describe("NotificationsService.generateComplianceReminders", () => {
  test("generates an OVERDUE notification for a past-deadline entry", async () => {
    const { prisma, companies } = makeMocks();
    const pastDeadline = new Date();
    pastDeadline.setDate(pastDeadline.getDate() - 2);
    prisma.complianceCalendarEntry.findMany.mockResolvedValue([
      { id: "entry-1", taxType: "VAT", periodLabel: "September 2026", statutoryDeadline: pastDeadline, amountNgn: "107500", approvalStatus: "AWAITING_APPROVAL" },
    ]);
    prisma.notification.create.mockImplementation(async ({ data }: any) => ({ id: "notif-1", ...data }));

    const service = new NotificationsService(prisma, companies);
    const result = await service.generateComplianceReminders("org-1", "company-1");

    expect(result.createdCount).toBe(1);
    expect(prisma.notification.create.mock.calls[0][0].data.category).toBe("OVERDUE_FILING");
    expect(prisma.notification.create.mock.calls[0][0].data.body).toMatch(/Netwave Technologies Ltd/);
  });

  test("generates an UPCOMING notification for a deadline within the reminder window, not for one far in the future", async () => {
    const { prisma, companies } = makeMocks();
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 60);
    prisma.complianceCalendarEntry.findMany.mockResolvedValue([
      { id: "entry-soon", taxType: "VAT", periodLabel: "October 2026", statutoryDeadline: soon, amountNgn: "50000", approvalStatus: "AWAITING_APPROVAL" },
      { id: "entry-far", taxType: "CIT", periodLabel: "FY2026", statutoryDeadline: farFuture, amountNgn: "200000", approvalStatus: "DRAFT" },
    ]);
    prisma.notification.create.mockImplementation(async ({ data }: any) => ({ id: "notif", ...data }));

    const service = new NotificationsService(prisma, companies);
    const result = await service.generateComplianceReminders("org-1", "company-1");

    expect(result.createdCount).toBe(1);
    expect(prisma.notification.create.mock.calls[0][0].data.relatedEntityId).toBe("entry-soon");
  });

  test("does not create a duplicate notification for an entry already notified", async () => {
    const { prisma, companies } = makeMocks();
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    prisma.complianceCalendarEntry.findMany.mockResolvedValue([
      { id: "entry-1", taxType: "VAT", periodLabel: "October 2026", statutoryDeadline: soon, amountNgn: "50000", approvalStatus: "AWAITING_APPROVAL" },
    ]);
    prisma.notification.findFirst.mockResolvedValue({ id: "already-exists" });

    const service = new NotificationsService(prisma, companies);
    const result = await service.generateComplianceReminders("org-1", "company-1");

    expect(result.createdCount).toBe(0);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
});

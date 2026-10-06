import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";

const UPCOMING_WINDOW_DAYS = 7;

/**
 * Compliance notifications (brief §26-27). IN_APP only — no email/SMS/WhatsApp provider
 * is wired up (no credentials exist in this environment); channel is recorded on the
 * Notification row so a real provider can be plugged in later without touching the
 * generation logic here.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService
  ) {}

  /**
   * Scans this company's compliance calendar for upcoming/overdue entries and creates a
   * notification for each one not already notified (dedup key: category + relatedEntityId)
   * — meant to be invoked on a schedule (brief §50).
   */
  async generateComplianceReminders(organizationId: string, companyId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const now = new Date();
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + UPCOMING_WINDOW_DAYS);

    const entries = await this.prisma.complianceCalendarEntry.findMany({
      where: { companyId, filingStatus: { not: "FILED" } },
    });

    const created = [];
    for (const entry of entries) {
      const isOverdue = entry.statutoryDeadline < now;
      const isUpcoming = !isOverdue && entry.statutoryDeadline <= windowEnd;
      if (!isOverdue && !isUpcoming) continue;

      const category = isOverdue ? "OVERDUE_FILING" : "UPCOMING_FILING";
      const existing = await this.prisma.notification.findFirst({ where: { companyId, category, relatedEntityType: "ComplianceCalendarEntry", relatedEntityId: entry.id } });
      if (existing) continue;

      const title = isOverdue ? `OVERDUE: ${entry.taxType} filing for ${company.name}` : `Upcoming ${entry.taxType} filing deadline for ${company.name}`;
      const body = [
        `${company.name} has a tax filing deadline ${isOverdue ? "that has passed" : "approaching"}.`,
        `Tax type: ${entry.taxType}`,
        `Period: ${entry.periodLabel}`,
        entry.amountNgn !== null ? `Tax payable: ₦${Number(entry.amountNgn).toLocaleString()}` : null,
        `Deadline: ${entry.statutoryDeadline.toISOString().slice(0, 10)}`,
        `Status: ${entry.approvalStatus}`,
      ]
        .filter(Boolean)
        .join("\n");

      const notification = await this.prisma.notification.create({
        data: { organizationId, companyId, category, title, body, channel: "IN_APP", status: "SENT", relatedEntityType: "ComplianceCalendarEntry", relatedEntityId: entry.id },
      });
      created.push(notification);
    }

    return { createdCount: created.length, notifications: created };
  }

  async listForUser(organizationId: string, userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { organizationId, OR: [{ userId }, { userId: null }], ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  async markRead(organizationId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification || notification.organizationId !== organizationId) throw new NotFoundException("Notification not found.");
    return this.prisma.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
  }
}

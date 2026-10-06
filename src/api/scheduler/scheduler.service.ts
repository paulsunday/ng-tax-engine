import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { ComplianceCalendarService } from "../compliance-calendar/compliance-calendar.service";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * Daily platform-wide sweep. ComplianceCalendarService.refreshOverdueStatus and
 * NotificationsService.generateComplianceReminders (brief §41-42) are already written as
 * per-company, idempotent operations (re-running them is always safe — refresh only flips
 * status based on today's date, reminders dedupe against existing notifications). This
 * service is purely the "for every company, call it" wrapper a real cron needs. One
 * company failing (e.g. bad data) must not stop the sweep for the rest — each iteration
 * is isolated and logged, never silently swallowed.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: ComplianceCalendarService,
    private readonly notifications: NotificationsService
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async runDailyComplianceSweep(): Promise<{ companiesProcessed: number; failures: number }> {
    const companies = await this.prisma.company.findMany({ select: { id: true, organizationId: true } });
    let failures = 0;

    for (const company of companies) {
      try {
        await this.calendar.refreshOverdueStatus(company.organizationId, company.id);
        await this.notifications.generateComplianceReminders(company.organizationId, company.id);
      } catch (error) {
        failures += 1;
        this.logger.error(`Daily compliance sweep failed for company ${company.id}: ${(error as Error).message}`, (error as Error).stack);
      }
    }

    this.logger.log(`Daily compliance sweep complete: ${companies.length} companies processed, ${failures} failures.`);
    return { companiesProcessed: companies.length, failures };
  }
}

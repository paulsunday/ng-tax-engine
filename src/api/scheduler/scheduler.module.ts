import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { SchedulerService } from "./scheduler.service";
import { ComplianceCalendarModule } from "../compliance-calendar/compliance-calendar.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [ScheduleModule.forRoot(), ComplianceCalendarModule, NotificationsModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}

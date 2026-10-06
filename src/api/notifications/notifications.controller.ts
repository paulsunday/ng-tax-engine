import { Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "../common/rbac.constants";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query("unreadOnly") unreadOnly?: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.notifications.listForUser(user.organizationId, user.sub, unreadOnly === "true");
  }

  @Post(":notificationId/read")
  markRead(@CurrentUser() user: JwtPayload, @Param("notificationId") notificationId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.notifications.markRead(user.organizationId, notificationId);
  }
}

@Controller("companies/:companyId/notifications")
@UseGuards(JwtAuthGuard)
export class CompanyNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post("generate-reminders")
  generateReminders(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.notifications.generateComplianceReminders(user.organizationId, companyId);
  }
}

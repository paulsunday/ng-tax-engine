import { Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { NotificationsController, CompanyNotificationsController } from "./notifications.controller";
import { CompaniesModule } from "../companies/companies.module";

@Module({
  imports: [CompaniesModule],
  providers: [NotificationsService],
  controllers: [NotificationsController, CompanyNotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}

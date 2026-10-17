import { Module } from "@nestjs/common";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { OrganizationsModule } from "../organizations/organizations.module";

@Module({
  imports: [AuditLogModule, OrganizationsModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}

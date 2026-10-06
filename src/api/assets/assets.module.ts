import { Module } from "@nestjs/common";
import { AssetsService } from "./assets.service";
import { AssetsController } from "./assets.controller";
import { CompaniesModule } from "../companies/companies.module";
import { AccountsModule } from "../accounts/accounts.module";
import { JournalModule } from "../journal/journal.module";
import { AuditLogModule } from "../audit-log/audit-log.module";

@Module({
  imports: [CompaniesModule, AccountsModule, JournalModule, AuditLogModule],
  providers: [AssetsService],
  controllers: [AssetsController],
  exports: [AssetsService],
})
export class AssetsModule {}

import { Module } from "@nestjs/common";
import { JournalService } from "./journal.service";
import { JournalController } from "./journal.controller";
import { CompaniesModule } from "../companies/companies.module";
import { AuditLogModule } from "../audit-log/audit-log.module";

@Module({
  imports: [CompaniesModule, AuditLogModule],
  providers: [JournalService],
  controllers: [JournalController],
  exports: [JournalService],
})
export class JournalModule {}

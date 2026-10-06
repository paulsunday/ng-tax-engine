import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { AuditController } from "./audit.controller";
import { CompaniesModule } from "../companies/companies.module";
import { JournalModule } from "../journal/journal.module";
import { AuditLogModule } from "../audit-log/audit-log.module";

@Module({
  imports: [CompaniesModule, JournalModule, AuditLogModule],
  providers: [AuditService],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}

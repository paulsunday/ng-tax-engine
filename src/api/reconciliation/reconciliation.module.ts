import { Module } from "@nestjs/common";
import { ReconciliationService } from "./reconciliation.service";
import { ReconciliationController } from "./reconciliation.controller";
import { CompaniesModule } from "../companies/companies.module";
import { BankAccountsModule } from "../bank-accounts/bank-accounts.module";
import { JournalModule } from "../journal/journal.module";
import { AuditLogModule } from "../audit-log/audit-log.module";

@Module({
  imports: [CompaniesModule, BankAccountsModule, JournalModule, AuditLogModule],
  providers: [ReconciliationService],
  controllers: [ReconciliationController],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}

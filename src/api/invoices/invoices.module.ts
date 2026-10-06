import { Module } from "@nestjs/common";
import { InvoicesService } from "./invoices.service";
import { InvoicesController } from "./invoices.controller";
import { CompaniesModule } from "../companies/companies.module";
import { CustomersModule } from "../customers/customers.module";
import { AccountsModule } from "../accounts/accounts.module";
import { JournalModule } from "../journal/journal.module";
import { AuditLogModule } from "../audit-log/audit-log.module";

@Module({
  imports: [CompaniesModule, CustomersModule, AccountsModule, JournalModule, AuditLogModule],
  providers: [InvoicesService],
  controllers: [InvoicesController],
  exports: [InvoicesService],
})
export class InvoicesModule {}

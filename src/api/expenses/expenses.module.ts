import { Module } from "@nestjs/common";
import { ExpensesService } from "./expenses.service";
import { ExpensesController } from "./expenses.controller";
import { CompaniesModule } from "../companies/companies.module";
import { SuppliersModule } from "../suppliers/suppliers.module";
import { AccountsModule } from "../accounts/accounts.module";
import { JournalModule } from "../journal/journal.module";
import { AuditLogModule } from "../audit-log/audit-log.module";

@Module({
  imports: [CompaniesModule, SuppliersModule, AccountsModule, JournalModule, AuditLogModule],
  providers: [ExpensesService],
  controllers: [ExpensesController],
  exports: [ExpensesService],
})
export class ExpensesModule {}

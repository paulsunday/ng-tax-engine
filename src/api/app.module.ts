import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuditLogModule } from "./audit-log/audit-log.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { CompaniesModule } from "./companies/companies.module";
import { AccountsModule } from "./accounts/accounts.module";
import { JournalModule } from "./journal/journal.module";
import { CustomersModule } from "./customers/customers.module";
import { SuppliersModule } from "./suppliers/suppliers.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { ExpensesModule } from "./expenses/expenses.module";
import { AssetsModule } from "./assets/assets.module";
import { TaxRulesModule } from "./tax-rules/tax-rules.module";
import { StorageModule } from "./storage/storage.module";
import { BankAccountsModule } from "./bank-accounts/bank-accounts.module";
import { BankImportModule } from "./bank-import/bank-import.module";
import { ReconciliationModule } from "./reconciliation/reconciliation.module";
import { DocumentsModule } from "./documents/documents.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditLogModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    CompaniesModule,
    AccountsModule,
    JournalModule,
    CustomersModule,
    SuppliersModule,
    InvoicesModule,
    ExpensesModule,
    AssetsModule,
    TaxRulesModule,
    StorageModule,
    BankAccountsModule,
    BankImportModule,
    ReconciliationModule,
    DocumentsModule,
  ],
})
export class AppModule {}

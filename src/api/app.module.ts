import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule, seconds } from "@nestjs/throttler";
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
import { FinancialStatementsModule } from "./financial-statements/financial-statements.module";
import { AuditModule } from "./audit/audit.module";
import { ScenariosModule } from "./scenarios/scenarios.module";
import { CapitalAllowanceModule } from "./capital-allowance/capital-allowance.module";
import { TaxLossModule } from "./tax-loss/tax-loss.module";
import { PayrollModule } from "./payroll/payroll.module";
import { WhtDeterminationModule } from "./wht-determination/wht-determination.module";
import { TaxCalculationModule } from "./tax-calculation/tax-calculation.module";
import { TaxReturnsModule } from "./tax-returns/tax-returns.module";
import { ComplianceCalendarModule } from "./compliance-calendar/compliance-calendar.module";
import { FilingModule } from "./filing/filing.module";
import { PaymentsModule } from "./payments/payments.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { AiToolsModule } from "./ai-tools/ai-tools.module";
import { SchedulerModule } from "./scheduler/scheduler.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global default: 100 requests/minute per IP. Auth endpoints override this with a much
    // tighter limit via @Throttle (brief §41: rate limiting against brute-force/abuse).
    ThrottlerModule.forRoot([{ name: "default", ttl: seconds(60), limit: 100 }]),
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
    FinancialStatementsModule,
    AuditModule,
    ScenariosModule,
    CapitalAllowanceModule,
    TaxLossModule,
    PayrollModule,
    WhtDeterminationModule,
    TaxCalculationModule,
    TaxReturnsModule,
    ComplianceCalendarModule,
    FilingModule,
    PaymentsModule,
    NotificationsModule,
    AiToolsModule,
    SchedulerModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

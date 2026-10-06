import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { BankImportService } from "./bank-import.service";
import { MatchingService } from "./matching.service";
import { BankImportController } from "./bank-import.controller";
import { BankTransactionsController } from "./bank-transactions.controller";
import { MatchingController } from "./matching.controller";
import { CompaniesModule } from "../companies/companies.module";
import { BankAccountsModule } from "../bank-accounts/bank-accounts.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [MulterModule.register({ storage: undefined /* default memoryStorage, so we control persistence via FileStorageAdapter */ }), CompaniesModule, BankAccountsModule, AuditLogModule, StorageModule],
  providers: [BankImportService, MatchingService],
  controllers: [BankImportController, BankTransactionsController, MatchingController],
  exports: [BankImportService, MatchingService],
})
export class BankImportModule {}

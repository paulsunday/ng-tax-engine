import { Module } from "@nestjs/common";
import { BankAccountsService } from "./bank-accounts.service";
import { BankAccountsController } from "./bank-accounts.controller";
import { CompaniesModule } from "../companies/companies.module";

@Module({
  imports: [CompaniesModule],
  providers: [BankAccountsService],
  controllers: [BankAccountsController],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}

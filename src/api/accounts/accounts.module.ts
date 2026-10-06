import { Module } from "@nestjs/common";
import { AccountsService } from "./accounts.service";
import { AccountsController } from "./accounts.controller";
import { CompaniesModule } from "../companies/companies.module";

@Module({
  imports: [CompaniesModule],
  providers: [AccountsService],
  controllers: [AccountsController],
  exports: [AccountsService],
})
export class AccountsModule {}

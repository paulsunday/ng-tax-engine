import { Module } from "@nestjs/common";
import { FinancialStatementsService } from "./financial-statements.service";
import { FinancialStatementsController } from "./financial-statements.controller";
import { CompaniesModule } from "../companies/companies.module";
import { JournalModule } from "../journal/journal.module";

@Module({
  imports: [CompaniesModule, JournalModule],
  providers: [FinancialStatementsService],
  controllers: [FinancialStatementsController],
  exports: [FinancialStatementsService],
})
export class FinancialStatementsModule {}

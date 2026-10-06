import { Module } from "@nestjs/common";
import { TaxReturnsService } from "./tax-returns.service";
import { TaxReturnsController } from "./tax-returns.controller";
import { CompaniesModule } from "../companies/companies.module";
import { AuditLogModule } from "../audit-log/audit-log.module";

@Module({
  imports: [CompaniesModule, AuditLogModule],
  providers: [TaxReturnsService],
  controllers: [TaxReturnsController],
  exports: [TaxReturnsService],
})
export class TaxReturnsModule {}

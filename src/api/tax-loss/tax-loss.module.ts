import { Module } from "@nestjs/common";
import { TaxLossService } from "./tax-loss.service";
import { TaxLossController } from "./tax-loss.controller";
import { CompaniesModule } from "../companies/companies.module";

@Module({
  imports: [CompaniesModule],
  providers: [TaxLossService],
  controllers: [TaxLossController],
  exports: [TaxLossService],
})
export class TaxLossModule {}

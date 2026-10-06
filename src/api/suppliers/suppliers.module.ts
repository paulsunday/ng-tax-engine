import { Module } from "@nestjs/common";
import { SuppliersService } from "./suppliers.service";
import { SuppliersController } from "./suppliers.controller";
import { CompaniesModule } from "../companies/companies.module";

@Module({
  imports: [CompaniesModule],
  providers: [SuppliersService],
  controllers: [SuppliersController],
  exports: [SuppliersService],
})
export class SuppliersModule {}

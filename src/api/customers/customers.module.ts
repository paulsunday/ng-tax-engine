import { Module } from "@nestjs/common";
import { CustomersService } from "./customers.service";
import { CustomersController } from "./customers.controller";
import { CompaniesModule } from "../companies/companies.module";

@Module({
  imports: [CompaniesModule],
  providers: [CustomersService],
  controllers: [CustomersController],
  exports: [CustomersService],
})
export class CustomersModule {}

import { Module } from "@nestjs/common";
import { FilingService } from "./filing.service";
import { FilingController } from "./filing.controller";
import { CompaniesModule } from "../companies/companies.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { ADAPTER_REGISTRY } from "./filing.constants";
import { AdapterRegistry } from "../../adapters/AdapterRegistry";
import { StateAuthorityRepository } from "../../rules/StateAuthorityRepository";

@Module({
  imports: [CompaniesModule, AuditLogModule],
  providers: [
    FilingService,
    { provide: ADAPTER_REGISTRY, useFactory: () => new AdapterRegistry(new StateAuthorityRepository()) },
  ],
  controllers: [FilingController],
  exports: [FilingService],
})
export class FilingModule {}

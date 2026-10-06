import { Module } from "@nestjs/common";
import { DocumentsService } from "./documents.service";
import { DocumentsController } from "./documents.controller";
import { CompaniesModule } from "../companies/companies.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { StorageModule } from "../storage/storage.module";
import { OCR_ADAPTER } from "./documents.constants";
import { TesseractOcrAdapter } from "../../documents/ocr/TesseractOcrAdapter";

@Module({
  imports: [CompaniesModule, AuditLogModule, StorageModule],
  providers: [DocumentsService, { provide: OCR_ADAPTER, useFactory: () => new TesseractOcrAdapter() }],
  controllers: [DocumentsController],
  exports: [DocumentsService],
})
export class DocumentsModule {}

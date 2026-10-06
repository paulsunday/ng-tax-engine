import { Module } from "@nestjs/common";
import * as path from "path";
import { LocalFileStorageAdapter } from "../../documents/storage/LocalFileStorageAdapter";
import { FILE_STORAGE_ADAPTER } from "./storage.constants";

/**
 * Same directory-adapter pattern as TaxAuthorityAdapter/AdapterRegistry: ships only
 * LocalFileStorageAdapter for now. Swap the factory below for an S3/Azure-Blob adapter
 * later — nothing outside this module needs to change, since everything else depends on
 * the FileStorageAdapter interface.
 */
@Module({
  providers: [
    {
      provide: FILE_STORAGE_ADAPTER,
      useFactory: () => new LocalFileStorageAdapter(process.env.FILE_STORAGE_ROOT ?? path.join(process.cwd(), "storage", "documents")),
    },
  ],
  exports: [FILE_STORAGE_ADAPTER],
})
export class StorageModule {}

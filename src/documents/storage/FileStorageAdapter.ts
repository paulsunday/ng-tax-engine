/**
 * Storage adapter interface (same adapter-directory philosophy as src/adapters/
 * TaxAuthorityAdapter.ts — one implementation per backend, swappable without touching
 * callers). Phase 3 ships only LocalFileStorageAdapter (disk); a cloud-object-storage
 * adapter (S3/Azure Blob/etc.) can be added later behind this same interface.
 */
export interface StoredFileHandle {
  storagePath: string; // opaque to the caller — pass back to retrieve/delete
  sizeBytes: number;
  checksumSha256: string;
}

export interface FileStorageAdapter {
  save(organizationId: string, companyId: string, originalFileName: string, data: Buffer): Promise<StoredFileHandle>;
  read(storagePath: string): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
}

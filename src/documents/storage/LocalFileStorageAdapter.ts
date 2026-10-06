import { createHash, randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { FileStorageAdapter, StoredFileHandle } from "./FileStorageAdapter";

/**
 * Stores uploaded files on local disk, namespaced by organizationId/companyId so one
 * tenant's documents are never physically mixed into another's directory. The on-disk
 * filename is always a server-generated UUID, never the client-supplied original file
 * name — this is a deliberate path-traversal defense (a file named "../../../etc/passwd"
 * or containing null bytes can never influence the actual write location) and avoids
 * filename collisions. The original name is kept only as metadata on the Document row.
 */
export class LocalFileStorageAdapter implements FileStorageAdapter {
  constructor(private readonly rootDir: string) {}

  async save(organizationId: string, companyId: string, _originalFileName: string, data: Buffer): Promise<StoredFileHandle> {
    const dir = path.join(this.rootDir, safeSegment(organizationId), safeSegment(companyId));
    await fs.mkdir(dir, { recursive: true });

    const fileId = randomUUID();
    const storagePath = path.join(dir, fileId);
    await fs.writeFile(storagePath, data);

    return {
      storagePath,
      sizeBytes: data.length,
      checksumSha256: createHash("sha256").update(data).digest("hex"),
    };
  }

  async read(storagePath: string): Promise<Buffer> {
    this.assertWithinRoot(storagePath);
    return fs.readFile(storagePath);
  }

  async delete(storagePath: string): Promise<void> {
    this.assertWithinRoot(storagePath);
    await fs.unlink(storagePath);
  }

  /** Defense in depth: even though storagePath always originates from save() above (never
   * client input directly), refuse to touch anything outside the configured root. */
  private assertWithinRoot(storagePath: string): void {
    const resolved = path.resolve(storagePath);
    const rootResolved = path.resolve(this.rootDir);
    if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
      throw new Error(`Refusing to access a path outside the storage root: ${storagePath}`);
    }
  }
}

function safeSegment(id: string): string {
  // organizationId/companyId are our own cuid()s, but never trust that blindly in a path join.
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

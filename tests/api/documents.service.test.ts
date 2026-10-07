import { BadRequestException } from "@nestjs/common";
import { DocumentsService } from "../../src/api/documents/documents.service";

function makeMocks() {
  const prisma: any = {
    document: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    invoice: { findUnique: jest.fn() },
    expense: { findUnique: jest.fn() },
  };
  const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
  const auditLog: any = { record: jest.fn() };
  const storage: any = { save: jest.fn(), read: jest.fn() };
  const ocrAdapter: any = { extract: jest.fn() };
  return { prisma, companies, auditLog, storage, ocrAdapter };
}

describe("DocumentsService.checkConsistency", () => {
  test("flags AMOUNT_MISMATCH_WITH_LINKED_TRANSACTION when extracted total differs materially from the linked invoice", async () => {
    const { prisma, companies, auditLog, storage, ocrAdapter } = makeMocks();
    prisma.document.findUnique.mockResolvedValue({
      id: "doc-1",
      companyId: "company-1",
      linkedEntityType: "Invoice",
      linkedEntityId: "inv-1",
      ocrStatus: "COMPLETED",
      ocrExtractedData: { fields: { totalAmountNgn: 50000 } },
    });
    prisma.invoice.findUnique.mockResolvedValue({ id: "inv-1", totalNgn: "107500" });
    prisma.document.update.mockImplementation(async ({ data }: any) => ({ id: "doc-1", ...data }));

    const service = new DocumentsService(prisma, companies, auditLog, storage, ocrAdapter);
    const result = await service.checkConsistency("org-1", "company-1", "doc-1");

    expect(result.inconsistencyFlags).toContain("AMOUNT_MISMATCH_WITH_LINKED_TRANSACTION");
  });

  test("does NOT flag a mismatch when the extracted total matches the linked expense within tolerance", async () => {
    const { prisma, companies, auditLog, storage, ocrAdapter } = makeMocks();
    prisma.document.findUnique.mockResolvedValue({
      id: "doc-2",
      companyId: "company-1",
      linkedEntityType: "Expense",
      linkedEntityId: "exp-1",
      ocrStatus: "COMPLETED",
      ocrExtractedData: { fields: { totalAmountNgn: 53750 } },
    });
    prisma.expense.findUnique.mockResolvedValue({ id: "exp-1", totalNgn: "53750.00" });
    prisma.document.update.mockImplementation(async ({ data }: any) => ({ id: "doc-2", ...data }));

    const service = new DocumentsService(prisma, companies, auditLog, storage, ocrAdapter);
    const result = await service.checkConsistency("org-1", "company-1", "doc-2");

    expect(result.inconsistencyFlags).not.toContain("AMOUNT_MISMATCH_WITH_LINKED_TRANSACTION");
  });

  test("refuses to check consistency before extraction has run", async () => {
    const { prisma, companies, auditLog, storage, ocrAdapter } = makeMocks();
    prisma.document.findUnique.mockResolvedValue({
      id: "doc-3",
      companyId: "company-1",
      linkedEntityType: "Invoice",
      linkedEntityId: "inv-1",
      ocrStatus: "PENDING",
    });

    const service = new DocumentsService(prisma, companies, auditLog, storage, ocrAdapter);
    await expect(service.checkConsistency("org-1", "company-1", "doc-3")).rejects.toThrow(BadRequestException);
  });

  test("refuses to check consistency for a document with no linked entity", async () => {
    const { prisma, companies, auditLog, storage, ocrAdapter } = makeMocks();
    prisma.document.findUnique.mockResolvedValue({ id: "doc-4", companyId: "company-1", linkedEntityType: null, linkedEntityId: null, ocrStatus: "COMPLETED" });

    const service = new DocumentsService(prisma, companies, auditLog, storage, ocrAdapter);
    await expect(service.checkConsistency("org-1", "company-1", "doc-4")).rejects.toThrow(BadRequestException);
  });
});

describe("DocumentsService.upload", () => {
  test("marks image/invoice documents as OCR-eligible (PENDING) and others as NOT_APPLICABLE", async () => {
    const { prisma, companies, auditLog, storage, ocrAdapter } = makeMocks();
    storage.save.mockResolvedValue({ storagePath: "/tmp/x", sizeBytes: 100, checksumSha256: "abc" });
    prisma.document.create.mockImplementation(async ({ data }: any) => ({ id: "doc-1", ...data }));

    const service = new DocumentsService(prisma, companies, auditLog, storage, ocrAdapter);

    const invoiceDoc = await service.upload("org-1", "company-1", "user-1", {
      category: "INVOICE",
      originalFileName: "inv.png",
      mimeType: "image/png",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
    });
    expect(invoiceDoc.ocrStatus).toBe("PENDING");

    const contractDoc = await service.upload("org-1", "company-1", "user-1", {
      category: "CONTRACT",
      originalFileName: "contract.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from("x"),
    });
    expect(contractDoc.ocrStatus).toBe("NOT_APPLICABLE");
  });
});

describe("DocumentsService.upload — file validation (mandate §19/§20)", () => {
  function makeMocks() {
    const prisma: any = { document: { create: jest.fn() } };
    const companies: any = { getOneOrThrow: jest.fn().mockResolvedValue({ id: "company-1" }) };
    const auditLog: any = { record: jest.fn() };
    const storage: any = { save: jest.fn().mockResolvedValue({ storagePath: "/tmp/x", sizeBytes: 100, checksumSha256: "abc" }) };
    const ocrAdapter: any = {};
    return { prisma, companies, auditLog, storage, ocrAdapter };
  }

  test("rejects a disallowed MIME type (e.g. an executable) outright", async () => {
    const { prisma, companies, auditLog, storage, ocrAdapter } = makeMocks();
    const service = new DocumentsService(prisma, companies, auditLog, storage, ocrAdapter);

    await expect(
      service.upload("org-1", "company-1", "user-1", {
        category: "OTHER",
        originalFileName: "innocuous.pdf.exe",
        mimeType: "application/x-msdownload",
        buffer: Buffer.from([0x4d, 0x5a]),
      })
    ).rejects.toThrow(BadRequestException);
    expect(storage.save).not.toHaveBeenCalled();
  });

  test("rejects an empty file", async () => {
    const { prisma, companies, auditLog, storage, ocrAdapter } = makeMocks();
    const service = new DocumentsService(prisma, companies, auditLog, storage, ocrAdapter);

    await expect(
      service.upload("org-1", "company-1", "user-1", { category: "OTHER", originalFileName: "empty.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) })
    ).rejects.toThrow(BadRequestException);
  });

  test("rejects a file whose content doesn't match its claimed type (spoofed mimetype)", async () => {
    const { prisma, companies, auditLog, storage, ocrAdapter } = makeMocks();
    const service = new DocumentsService(prisma, companies, auditLog, storage, ocrAdapter);

    await expect(
      service.upload("org-1", "company-1", "user-1", {
        category: "OTHER",
        originalFileName: "fake.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("this is not actually a pdf"),
      })
    ).rejects.toThrow(/does not match its declared type/);
    expect(storage.save).not.toHaveBeenCalled();
  });

  test("accepts a genuine PDF (real magic bytes, allowed mimetype)", async () => {
    const { prisma, companies, auditLog, storage, ocrAdapter } = makeMocks();
    prisma.document.create.mockImplementation(async ({ data }: any) => ({ id: "doc-1", ...data }));
    const service = new DocumentsService(prisma, companies, auditLog, storage, ocrAdapter);

    await expect(
      service.upload("org-1", "company-1", "user-1", {
        category: "OTHER",
        originalFileName: "real.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n%real pdf content"),
      })
    ).resolves.toBeDefined();
    expect(storage.save).toHaveBeenCalled();
  });
});

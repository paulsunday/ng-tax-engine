import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DocumentCategory } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { FILE_STORAGE_ADAPTER } from "../storage/storage.constants";
import { FileStorageAdapter } from "../../documents/storage/FileStorageAdapter";
import { OCR_ADAPTER } from "./documents.constants";
import { OcrAdapter } from "../../documents/ocr/OcrAdapter";
import { extractFieldsFromText } from "../../documents/ocr/fieldExtraction";
import { parsePdf } from "../../bank-import/parsers/pdfParser";

export interface UploadDocumentInput {
  category: DocumentCategory;
  originalFileName: string;
  mimeType: string;
  buffer: Buffer;
  linkedEntityType?: string;
  linkedEntityId?: string;
}

const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/bmp"];
const OCR_ELIGIBLE_CATEGORIES: DocumentCategory[] = ["INVOICE", "RECEIPT", "PAYMENT_EVIDENCE"];

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly auditLog: AuditLogService,
    @Inject(FILE_STORAGE_ADAPTER) private readonly storage: FileStorageAdapter,
    @Inject(OCR_ADAPTER) private readonly ocrAdapter: OcrAdapter
  ) {}

  async upload(organizationId: string, companyId: string, userId: string, input: UploadDocumentInput) {
    await this.companies.getOneOrThrow(organizationId, companyId);

    const stored = await this.storage.save(organizationId, companyId, input.originalFileName, input.buffer);
    const isOcrEligible =
      OCR_ELIGIBLE_CATEGORIES.includes(input.category) && (IMAGE_MIME_TYPES.includes(input.mimeType) || input.mimeType === "application/pdf");

    const document = await this.prisma.document.create({
      data: {
        organizationId,
        companyId,
        category: input.category,
        fileName: input.originalFileName,
        mimeType: input.mimeType,
        sizeBytes: stored.sizeBytes,
        storagePath: stored.storagePath,
        checksumSha256: stored.checksumSha256,
        linkedEntityType: input.linkedEntityType,
        linkedEntityId: input.linkedEntityId,
        ocrStatus: isOcrEligible ? "PENDING" : "NOT_APPLICABLE",
        uploadedBy: userId,
      },
    });

    await this.auditLog.record({
      organizationId,
      userId,
      action: "UPLOAD",
      objectType: "Document",
      objectId: document.id,
      newValue: { fileName: document.fileName, category: document.category, sizeBytes: stored.sizeBytes },
    });

    return document;
  }

  /**
   * Runs extraction: real OCR (tesseract.js) for image documents, direct text extraction
   * (no OCR needed — it's already text) for PDFs. Both paths funnel through the same
   * deterministic regex field-extractor so downstream consumers see one consistent shape.
   */
  async runExtraction(organizationId: string, companyId: string, documentId: string) {
    const document = await this.getOneOrThrow(organizationId, companyId, documentId);
    if (document.ocrStatus !== "PENDING") {
      throw new BadRequestException(`Document extraction status is "${document.ocrStatus}" — only PENDING documents can be processed.`);
    }

    try {
      const buffer = await this.storage.read(document.storagePath);
      let rawText: string;
      let engineUsed: string;

      if (document.mimeType === "application/pdf") {
        const extracted = await parsePdf(buffer);
        rawText = extracted.rawText;
        engineUsed = "pdf-parse (direct text extraction, no OCR needed)";
      } else {
        const result = await this.ocrAdapter.extract(buffer);
        rawText = result.rawText;
        engineUsed = result.engineUsed;
      }

      const { fields, confidence } = extractFieldsFromText(rawText);

      return this.prisma.document.update({
        where: { id: documentId },
        data: {
          ocrStatus: "COMPLETED",
          ocrExtractedData: { rawText, fields, engineUsed } as any,
          ocrConfidence: confidence as any,
        },
      });
    } catch (err) {
      await this.prisma.document.update({ where: { id: documentId }, data: { ocrStatus: "FAILED" } });
      throw err;
    }
  }

  /**
   * Flags inconsistencies between extracted document data and the linked ledger entity
   * (brief §9: "flag documents that appear inconsistent with the associated transaction").
   * Only ever flags — never silently corrects either side.
   */
  async checkConsistency(organizationId: string, companyId: string, documentId: string) {
    const document = await this.getOneOrThrow(organizationId, companyId, documentId);
    if (!document.linkedEntityType || !document.linkedEntityId) {
      throw new BadRequestException("Document is not linked to any entity — nothing to check against.");
    }
    if (document.ocrStatus !== "COMPLETED") {
      throw new BadRequestException("Run extraction before checking consistency.");
    }

    const extracted = document.ocrExtractedData as any;
    const extractedTotal: number | null = extracted?.fields?.totalAmountNgn ?? null;

    let linkedTotal: number | null = null;
    if (document.linkedEntityType === "Invoice") {
      const invoice = await this.prisma.invoice.findUnique({ where: { id: document.linkedEntityId } });
      linkedTotal = invoice ? Number(invoice.totalNgn) : null;
    } else if (document.linkedEntityType === "Expense") {
      const expense = await this.prisma.expense.findUnique({ where: { id: document.linkedEntityId } });
      linkedTotal = expense ? Number(expense.totalNgn) : null;
    }

    const flags: string[] = [];
    if (extractedTotal !== null && linkedTotal !== null && Math.abs(extractedTotal - linkedTotal) > 1) {
      flags.push("AMOUNT_MISMATCH_WITH_LINKED_TRANSACTION");
    }
    if (linkedTotal === null) {
      flags.push("LINKED_ENTITY_NOT_FOUND_OR_UNSUPPORTED_TYPE");
    }

    return this.prisma.document.update({ where: { id: documentId }, data: { inconsistencyFlags: flags as any } });
  }

  async listForCompany(organizationId: string, companyId: string, category?: DocumentCategory) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.document.findMany({ where: { companyId, ...(category ? { category } : {}) }, orderBy: { createdAt: "desc" } });
  }

  async getOneOrThrow(organizationId: string, companyId: string, documentId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document || document.companyId !== companyId) throw new NotFoundException("Document not found.");
    return document;
  }

  async download(organizationId: string, companyId: string, documentId: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const document = await this.getOneOrThrow(organizationId, companyId, documentId);
    const buffer = await this.storage.read(document.storagePath);
    return { buffer, fileName: document.fileName, mimeType: document.mimeType };
  }
}

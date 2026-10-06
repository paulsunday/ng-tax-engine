import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { StatementFileFormat } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "../companies/companies.service";
import { BankAccountsService } from "../bank-accounts/bank-accounts.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { FILE_STORAGE_ADAPTER } from "../storage/storage.constants";
import { FileStorageAdapter } from "../../documents/storage/FileStorageAdapter";
import { parseCsv, ParsedTable } from "../../bank-import/parsers/csvParser";
import { parseXlsx } from "../../bank-import/parsers/xlsxParser";
import { parsePdf } from "../../bank-import/parsers/pdfParser";
import { detectColumnMapping, ColumnMapping } from "../../bank-import/columnMapping";
import { normalizeRows } from "../../bank-import/rowNormalizer";
import { computeDedupeHash } from "../../bank-import/dedupe";

export interface UploadStatementInput {
  bankAccountId: string;
  originalFileName: string;
  mimeType: string;
  buffer: Buffer;
}

function detectFormat(fileName: string, mimeType: string): StatementFileFormat {
  const ext = fileName.toLowerCase().split(".").pop();
  if (mimeType.includes("csv") || ext === "csv") return "CSV";
  if (mimeType.includes("pdf") || ext === "pdf") return "PDF";
  if (mimeType.includes("spreadsheet") || ext === "xlsx" || ext === "xls") return "XLSX";
  throw new BadRequestException(`Unsupported statement file type: ${mimeType} (${fileName}). Supported: CSV, XLSX, PDF.`);
}

@Injectable()
export class BankImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
    private readonly bankAccounts: BankAccountsService,
    private readonly auditLog: AuditLogService,
    @Inject(FILE_STORAGE_ADAPTER) private readonly storage: FileStorageAdapter
  ) {}

  async uploadStatement(organizationId: string, companyId: string, userId: string, input: UploadStatementInput) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    await this.bankAccounts.getOneOrThrow(organizationId, companyId, input.bankAccountId);

    const format = detectFormat(input.originalFileName, input.mimeType);
    const stored = await this.storage.save(organizationId, companyId, input.originalFileName, input.buffer);

    const statementImport = await this.prisma.bankStatementImport.create({
      data: {
        organizationId,
        companyId,
        bankAccountId: input.bankAccountId,
        fileName: input.originalFileName,
        fileFormat: format,
        storagePath: stored.storagePath,
        status: "PENDING_MAPPING",
        uploadedBy: userId,
      },
    });

    if (format === "PDF") {
      // PDFs never get auto-processed — brief §7's "where technically possible" does not
      // extend to reliable column auto-detection on a format with no real table structure.
      // See src/bank-import/parsers/pdfParser.ts for why.
      const extraction = await parsePdf(input.buffer);
      return {
        import: statementImport,
        requiresManualMapping: true,
        reason: "PDF statements always require manual confirmation — table structure cannot be reliably auto-detected.",
        headers: extraction.headers,
        previewRows: extraction.rows.slice(0, 20),
        matchedLineCount: extraction.matchedLineCount,
        totalLineCount: extraction.totalLineCount,
      };
    }

    const table: ParsedTable = format === "CSV" ? parseCsv(input.buffer) : await parseXlsx(input.buffer);
    const detection = detectColumnMapping(table.headers);

    if (detection.requiresManualMapping) {
      return {
        import: statementImport,
        requiresManualMapping: true,
        reason: detection.reason,
        headers: table.headers,
        previewRows: table.rows.slice(0, 20),
      };
    }

    const processed = await this.processRows(organizationId, companyId, userId, statementImport.id, input.bankAccountId, table.rows, detection.mapping);
    return { import: processed.updatedImport, requiresManualMapping: false, ...processed.summary };
  }

  /** Called when auto-detection failed/was declined — the client supplies the real mapping. */
  async confirmMapping(organizationId: string, companyId: string, userId: string, importId: string, mapping: ColumnMapping) {
    const statementImport = await this.getOneOrThrow(organizationId, companyId, importId);
    if (statementImport.status === "PROCESSED") {
      throw new BadRequestException("This import has already been processed.");
    }

    const fileBuffer = await this.storage.read(statementImport.storagePath);
    let rawRows: string[][];
    if (statementImport.fileFormat === "CSV") {
      rawRows = parseCsv(fileBuffer).rows;
    } else if (statementImport.fileFormat === "XLSX") {
      rawRows = (await parseXlsx(fileBuffer)).rows;
    } else {
      rawRows = (await parsePdf(fileBuffer)).rows;
    }

    const processed = await this.processRows(organizationId, companyId, userId, importId, statementImport.bankAccountId, rawRows, mapping);
    return { import: processed.updatedImport, ...processed.summary };
  }

  private async processRows(
    organizationId: string,
    companyId: string,
    userId: string,
    importId: string,
    bankAccountId: string,
    rawRows: string[][],
    mapping: ColumnMapping
  ) {
    const { rows, errors } = normalizeRows(rawRows, mapping);

    let importedCount = 0;
    let duplicateCount = 0;
    for (const row of rows) {
      const dedupeHash = computeDedupeHash(bankAccountId, row);
      const existing = await this.prisma.bankTransaction.findFirst({ where: { bankAccountId, dedupeHash } });
      if (existing) {
        duplicateCount++;
        continue;
      }
      await this.prisma.bankTransaction.create({
        data: {
          organizationId,
          companyId,
          bankAccountId,
          importId,
          transactionDate: new Date(row.date),
          narration: row.narration,
          reference: row.reference,
          debitNgn: row.debitNgn,
          creditNgn: row.creditNgn,
          balanceAfterNgn: row.balanceAfterNgn,
          dedupeHash,
        },
      });
      importedCount++;
    }

    const updatedImport = await this.prisma.bankStatementImport.update({
      where: { id: importId },
      data: {
        status: "PROCESSED",
        columnMapping: mapping as any,
        importedRowCount: importedCount,
        skippedRowCount: errors.length + duplicateCount,
      },
    });

    await this.auditLog.record({
      organizationId,
      userId,
      action: "PROCESS",
      objectType: "BankStatementImport",
      objectId: importId,
      newValue: { importedCount, duplicateCount, errorCount: errors.length },
    });

    return { updatedImport, summary: { importedCount, duplicateCount, errorRows: errors } };
  }

  async listTransactions(organizationId: string, companyId: string, bankAccountId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    return this.prisma.bankTransaction.findMany({ where: { companyId, bankAccountId }, orderBy: { transactionDate: "desc" } });
  }

  async getOneOrThrow(organizationId: string, companyId: string, importId: string) {
    await this.companies.getOneOrThrow(organizationId, companyId);
    const statementImport = await this.prisma.bankStatementImport.findUnique({ where: { id: importId } });
    if (!statementImport || statementImport.companyId !== companyId) throw new NotFoundException("Bank statement import not found.");
    return statementImport;
  }
}

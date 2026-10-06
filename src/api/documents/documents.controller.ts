import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { DocumentsService } from "./documents.service";
import { UploadDocumentDto } from "./dto/upload-document.dto";
import { DocumentCategory } from "@prisma/client";

const MAX_DOCUMENT_SIZE_BYTES = 15 * 1024 * 1024;

@Controller("companies/:companyId/documents")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post("upload")
  @RequirePermissions(PERMISSIONS.CREATE_TRANSACTIONS)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES } }))
  upload(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.documents.upload(user.organizationId, companyId, user.sub, {
      category: dto.category,
      originalFileName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
      linkedEntityType: dto.linkedEntityType,
      linkedEntityId: dto.linkedEntityId,
    });
  }

  @Post(":documentId/extract")
  @RequirePermissions(PERMISSIONS.CREATE_TRANSACTIONS)
  runExtraction(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("documentId") documentId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.documents.runExtraction(user.organizationId, companyId, documentId);
  }

  @Post(":documentId/check-consistency")
  @RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
  checkConsistency(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("documentId") documentId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.documents.checkConsistency(user.organizationId, companyId, documentId);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
  list(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Query("category") category?: DocumentCategory) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.documents.listForCompany(user.organizationId, companyId, category);
  }

  @Get(":documentId/download")
  @RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
  async download(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Param("documentId") documentId: string,
    @Res() res: Response
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    const { buffer, fileName, mimeType } = await this.documents.download(user.organizationId, companyId, documentId);
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(buffer);
  }
}

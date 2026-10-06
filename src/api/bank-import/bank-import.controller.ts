import { Body, Controller, FileTypeValidator, ForbiddenException, MaxFileSizeValidator, Param, ParseFilePipe, Post, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { BankImportService } from "./bank-import.service";
import { ConfirmMappingDto } from "./dto/confirm-mapping.dto";

const MAX_STATEMENT_SIZE_BYTES = 20 * 1024 * 1024; // 20MB — generous for a bank statement, small enough to bound parse/OCR cost

@Controller("companies/:companyId/bank-accounts/:bankAccountId/statements")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BankImportController {
  constructor(private readonly bankImport: BankImportService) {}

  @Post("upload")
  @RequirePermissions(PERMISSIONS.IMPORT_BANK_STATEMENTS)
  @UseInterceptors(FileInterceptor("file"))
  upload(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Param("bankAccountId") bankAccountId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_STATEMENT_SIZE_BYTES }),
          new FileTypeValidator({ fileType: /(csv|vnd\.openxmlformats-officedocument\.spreadsheetml|pdf|octet-stream)/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.bankImport.uploadStatement(user.organizationId, companyId, user.sub, {
      bankAccountId,
      originalFileName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
    });
  }

  @Post(":importId/confirm-mapping")
  @RequirePermissions(PERMISSIONS.IMPORT_BANK_STATEMENTS)
  confirmMapping(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Param("importId") importId: string,
    @Body() dto: ConfirmMappingDto
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.bankImport.confirmMapping(user.organizationId, companyId, user.sub, importId, dto.mapping);
  }
}

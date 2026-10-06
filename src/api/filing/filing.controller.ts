import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { FilingService } from "./filing.service";
import { SubmitFilingDto } from "./dto/submit-filing.dto";
import { RecordReceiptDto } from "./dto/record-receipt.dto";

@Controller("companies/:companyId/tax-returns/:taxReturnId/filing")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FilingController {
  constructor(private readonly filing: FilingService) {}

  @Post("submit")
  @RequirePermissions(PERMISSIONS.SUBMIT_TAX_FILING)
  submit(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Param("taxReturnId") taxReturnId: string,
    @Body() dto: SubmitFilingDto
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.filing.submit(user.organizationId, companyId, user.sub, taxReturnId, dto.mode);
  }

  @Post("record-manual-receipt")
  @RequirePermissions(PERMISSIONS.SUBMIT_TAX_FILING)
  recordReceipt(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Param("taxReturnId") taxReturnId: string,
    @Body() dto: RecordReceiptDto
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.filing.recordManualReceipt(user.organizationId, companyId, user.sub, taxReturnId, dto.receiptReference, dto.submissionReference);
  }

  @Get("attempts")
  @RequirePermissions(PERMISSIONS.VIEW_TAX_HISTORY)
  listAttempts(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Param("taxReturnId") taxReturnId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.filing.listAttempts(user.organizationId, companyId, taxReturnId);
  }
}

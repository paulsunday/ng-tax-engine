import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { JournalService } from "./journal.service";
import { PostJournalEntryDto } from "./dto/post-journal-entry.dto";

@Controller("companies/:companyId/journal")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Post("entries")
  @RequirePermissions(PERMISSIONS.CREATE_TRANSACTIONS)
  postEntry(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Body() dto: PostJournalEntryDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.journal.postEntry(user.organizationId, companyId, user.sub, {
      entryDate: new Date(dto.entryDate),
      description: dto.description,
      source: dto.source,
      sourceId: dto.sourceId,
      documentReference: dto.documentReference,
      lines: dto.lines,
    });
  }

  @Post("entries/:journalEntryId/void")
  @RequirePermissions(PERMISSIONS.DELETE_TRANSACTIONS)
  voidEntry(
    @CurrentUser() user: JwtPayload,
    @Param("companyId") companyId: string,
    @Param("journalEntryId") journalEntryId: string,
    @Body("reason") reason: string
  ) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.journal.voidEntry(user.organizationId, companyId, user.sub, journalEntryId, reason);
  }

  @Get("trial-balance")
  @RequirePermissions(PERMISSIONS.VIEW_TRANSACTIONS)
  trialBalance(@CurrentUser() user: JwtPayload, @Param("companyId") companyId: string, @Query("asOfDate") asOfDate?: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.journal.getTrialBalance(user.organizationId, companyId, asOfDate ? new Date(asOfDate) : undefined);
  }
}

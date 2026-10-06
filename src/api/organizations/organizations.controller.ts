import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { OrganizationsService } from "./organizations.service";
import { AddMemberDto } from "./dto/add-member.dto";
import { ForbiddenException } from "@nestjs/common";

@Controller("organizations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get("me")
  async getMine(@CurrentUser() user: JwtPayload) {
    if (!user.organizationId) return null;
    return this.organizations.getById(user.organizationId);
  }

  @Get("me/members")
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async getMembers(@CurrentUser() user: JwtPayload) {
    if (!user.organizationId) return [];
    return this.organizations.listMembers(user.organizationId);
  }

  @Post("me/members")
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async addMember(@CurrentUser() user: JwtPayload, @Body() dto: AddMemberDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.organizations.addMember(user.organizationId, user.sub, dto);
  }
}

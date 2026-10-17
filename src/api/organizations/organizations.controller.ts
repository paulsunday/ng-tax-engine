import { Body, Controller, ForbiddenException, Get, Param, Post, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PERMISSIONS, JwtPayload } from "../common/rbac.constants";
import { OrganizationsService } from "./organizations.service";
import { AddMemberDto } from "./dto/add-member.dto";
import { InviteMemberDto } from "./dto/invite-member.dto";
import { ChangeMemberRoleDto } from "./dto/change-member-role.dto";

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
    if (!user.organizationId) return { members: [] };
    return this.organizations.listMembers(user.organizationId);
  }

  /** @deprecated Use POST /organizations/me/invitations instead — kept only for backward compatibility, not called by the current frontend. */
  @Post("me/members")
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async addMember(@CurrentUser() user: JwtPayload, @Body() dto: AddMemberDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.organizations.addMember(user.organizationId, user.sub, dto);
  }

  @Post("me/invitations")
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async inviteMember(@CurrentUser() user: JwtPayload, @Body() dto: InviteMemberDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.organizations.inviteMember(user.organizationId, user.sub, user.isPlatformAdmin, dto);
  }

  @Post("me/invitations/:id/resend")
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async resendInvitation(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.organizations.resendInvitation(user.organizationId, user.sub, id);
  }

  @Post("me/invitations/:id/revoke")
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async revokeInvitation(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.organizations.revokeInvitation(user.organizationId, user.sub, id);
  }

  @Patch("me/members/:membershipId")
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async changeMemberRole(@CurrentUser() user: JwtPayload, @Param("membershipId") membershipId: string, @Body() dto: ChangeMemberRoleDto) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.organizations.changeMemberRole(user.organizationId, user.sub, user.isPlatformAdmin, membershipId, dto.roleName);
  }

  @Post("me/members/:membershipId/disable")
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async disableMember(@CurrentUser() user: JwtPayload, @Param("membershipId") membershipId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.organizations.disableMember(user.organizationId, user.sub, user.isPlatformAdmin, membershipId);
  }

  @Post("me/members/:membershipId/enable")
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async enableMember(@CurrentUser() user: JwtPayload, @Param("membershipId") membershipId: string) {
    if (!user.organizationId) throw new ForbiddenException("No organization context.");
    return this.organizations.enableMember(user.organizationId, user.sub, membershipId);
  }
}

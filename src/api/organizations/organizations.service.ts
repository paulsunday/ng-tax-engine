import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";

const BCRYPT_ROUNDS = 12;

export interface AddMemberInput {
  email: string;
  fullName: string;
  temporaryPassword: string;
  roleName: string;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService
  ) {}

  async getById(organizationId: string) {
    return this.prisma.organization.findUnique({ where: { id: organizationId } });
  }

  async listMembers(organizationId: string) {
    return this.prisma.organizationUser.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, email: true, fullName: true, isActive: true } }, role: true },
    });
  }

  /**
   * Phase 1 simplification: the inviter sets a temporary password directly rather than
   * triggering an email-invite flow (no email service wired up yet). The new member
   * should be prompted to change it on first login once that flow exists (Phase 2+).
   */
  async addMember(organizationId: string, actingUserId: string, input: AddMemberInput) {
    const role = await this.prisma.role.findUnique({ where: { name: input.roleName } });
    if (!role) throw new BadRequestException(`Unknown role "${input.roleName}".`);

    let user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (user) {
      const existingMembership = await this.prisma.organizationUser.findUnique({
        where: { organizationId_userId: { organizationId, userId: user.id } },
      });
      if (existingMembership) throw new ConflictException("User is already a member of this organization.");
    } else {
      user = await this.prisma.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          passwordHash: await bcrypt.hash(input.temporaryPassword, BCRYPT_ROUNDS),
        },
      });
    }

    const membership = await this.prisma.organizationUser.create({
      data: { organizationId, userId: user.id, roleId: role.id },
    });

    await this.auditLog.record({
      organizationId,
      userId: actingUserId,
      action: "CREATE",
      objectType: "OrganizationUser",
      objectId: membership.id,
      newValue: { addedUserId: user.id, email: user.email, role: role.name },
    });

    return membership;
  }
}

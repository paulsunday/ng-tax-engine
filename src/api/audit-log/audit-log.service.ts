import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface RecordAuditLogInput {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  reason?: string | null;
}

/**
 * Immutable audit trail (brief §29). This is the ONLY way any part of the API may write
 * to the AuditLog table — there is no update/delete exposed anywhere, by design.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditLogInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        action: input.action,
        objectType: input.objectType,
        objectId: input.objectId ?? null,
        previousValue: input.previousValue as any,
        newValue: input.newValue as any,
        ipAddress: input.ipAddress ?? null,
        reason: input.reason ?? null,
      },
    });
  }

  async listForOrganization(organizationId: string, take = 100) {
    return this.prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take,
    });
  }
}

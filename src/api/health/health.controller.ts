import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "../prisma/prisma.service";

// Orchestrator liveness/readiness probes poll far more often than the global rate limit
// allows — exempt this controller rather than raising the app-wide limit for everyone else.
@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness only — process is up. Used by orchestrators that just need "is it running". */
  @Get()
  @HttpCode(HttpStatus.OK)
  liveness() {
    return { status: "ok", uptimeSeconds: process.uptime(), timestamp: new Date().toISOString() };
  }

  /** Readiness — can the app actually serve traffic (DB reachable)? */
  @Get("ready")
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "reachable", timestamp: new Date().toISOString() };
    } catch (error) {
      throw new ServiceUnavailableException({ status: "error", database: "unreachable", message: (error as Error).message });
    }
  }
}

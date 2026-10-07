import { Injectable, Logger, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

/**
 * Baseline operational visibility (mandate §16) that needs no external account: every
 * request is logged with method/path/status/duration once it finishes, at a severity
 * matched to the response. Railway captures stdout as structured logs automatically, so
 * this alone makes "find every 5xx in the last hour" a log search rather than a guess —
 * the gap that's left (paging someone when that happens) needs a real uptime/alerting
 * account and is documented, not faked, in docs/MONITORING.md.
 */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HTTP");

  use(req: Request, res: Response, next: NextFunction) {
    const startedAt = Date.now();
    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const message = `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`;
      if (res.statusCode >= 500) {
        this.logger.error(message);
      } else if (res.statusCode >= 400) {
        this.logger.warn(message);
      } else {
        this.logger.log(message);
      }
    });
    next();
  }
}

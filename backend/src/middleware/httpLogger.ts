import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

/**
 * One structured line per request, replacing morgan's combined text format.
 *
 * Text logs cannot be queried; this emits JSON carrying the request id, so a
 * request and any errors it produced can be pulled up together.
 */
export function httpLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const payload = {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        ip: req.ip,
        userAgent: req.headers["user-agent"]
      };

      // Health probes run constantly and would drown everything else.
      if (req.originalUrl.startsWith("/health")) {
        logger.trace(payload, "request");
        return;
      }

      if (res.statusCode >= 500) logger.error(payload, "request failed");
      else if (res.statusCode >= 400) logger.warn(payload, "request rejected");
      else logger.info(payload, "request");
    });

    next();
  };
}

import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

/**
 * Writes an AuditLog row for the request once the response is sent.
 *
 * Every outcome is recorded, not just 2xx. The previous early return on
 * non-2xx meant failed logins, denied access and server errors left no trace
 * at all, which is backwards for a system whose compliance posture rests on
 * its audit trail: the security-relevant events are exactly the ones that
 * were being dropped.
 */
export function audit(action: string, resourceType?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      const durationMs = Date.now() - start;
      const outcome =
        res.statusCode < 400
          ? "SUCCESS"
          : res.statusCode < 500
            ? "DENIED"
            : "ERROR";

      prisma.auditLog
        .create({
          data: {
            userId: req.user?.id,
            action,
            resourceType,
            resourceId: req.params?.id ?? undefined,
            metadata: {
              method: req.method,
              path: req.originalUrl,
              statusCode: res.statusCode,
              outcome,
              durationMs,
              ip: req.ip
            }
          }
        })
        // Fire and forget, but not silently: an unhandled rejection here would
        // take the process down on a transient database error.
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error("Failed to write audit log", {
            action,
            statusCode: res.statusCode,
            error: err instanceof Error ? err.message : String(err)
          });
        });
    });
    next();
  };
}

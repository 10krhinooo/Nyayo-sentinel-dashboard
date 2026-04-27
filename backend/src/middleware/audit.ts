import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

export function audit(action: string, resourceType?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      const durationMs = Date.now() - start;
      void prisma.auditLog.create({
        data: {
          userId: req.user?.id,
          action,
          resourceType,
          resourceId: req.params?.id ?? undefined,
          metadata: {
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            durationMs,
            ip: req.ip
          }
        }
      });
    });
    next();
  };
}

import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

export function audit(action: string, resourceType?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      const durationMs = Date.now() - start;
      void prisma.auditLog.create({
        data: {
          userId: req.user?.id,
          action,
          resourceType,
          resourceId: undefined,
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


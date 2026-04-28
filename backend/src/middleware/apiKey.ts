import { timingSafeEqual } from "crypto";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const provided = req.headers["x-api-key"];

  if (!env.SCRAPER_API_KEY) {
    return res.status(503).json({ message: "Ingest endpoint not configured (SCRAPER_API_KEY not set)" });
  }

  if (!provided || typeof provided !== "string") {
    return res.status(401).json({ message: "API key required" });
  }

  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(env.SCRAPER_API_KEY);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(401).json({ message: "Invalid API key" });
    }
  } catch {
    return res.status(401).json({ message: "Invalid API key" });
  }

  return next();
}

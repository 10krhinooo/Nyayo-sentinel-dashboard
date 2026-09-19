import { Router } from "express";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

const router = Router();

/**
 * Liveness: is the process running at all.
 *
 * Deliberately touches nothing external. A liveness probe that checks the
 * database restarts the application when the database blips, which is both
 * useless and harmful.
 */
router.get("/live", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

/**
 * Readiness: can this instance actually serve traffic.
 *
 * The previous single /health returned a static {status:"ok"} and never
 * touched Postgres, so an instance with a dead database reported healthy and
 * kept receiving traffic.
 */
router.get("/ready", async (_req, res) => {
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch (err) {
    checks.database = { ok: false, error: err instanceof Error ? err.message : "unknown" };
    logger.error({ err }, "Readiness check failed: database unreachable");
  }

  const ready = Object.values(checks).every((c) => c.ok);
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready", checks });
});

// Kept so existing probes and the Docker healthcheck do not break.
router.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

export default router;

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn() },
}));

const mockPrisma = { $queryRaw: vi.fn() };
vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));

const healthRoutes = (await import("../../routes/health")).default;

function app() {
  const a = express();
  a.use("/health", healthRoutes);
  return a;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /health/live", () => {
  it("reports ok with an uptime", async () => {
    const res = await request(app()).get("/health/live");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptime).toBe("number");
  });

  // A liveness probe that checks the database restarts the application
  // whenever the database blips, which makes an outage worse.
  it("does not touch the database", async () => {
    await request(app()).get("/health/live");
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("GET /health/ready", () => {
  it("reports ready when the database answers", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const res = await request(app()).get("/health/ready");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.checks.database.ok).toBe(true);
  });

  // The previous single /health returned a static ok and never checked
  // anything, so an instance with a dead database kept taking traffic.
  it("reports 503 when the database is unreachable", async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error("connection refused"));
    const res = await request(app()).get("/health/ready");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not_ready");
    expect(res.body.checks.database.ok).toBe(false);
    expect(res.body.checks.database.error).toContain("connection refused");
  });
});

describe("GET /health", () => {
  it("still answers for existing probes", async () => {
    const res = await request(app()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

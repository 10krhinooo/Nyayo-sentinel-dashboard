import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";

const SECRET = "test-access-secret";

vi.mock("../../config/env", () => ({
  env: {
    LOG_LEVEL: "silent",
    JWT_ACCESS_TOKEN_SECRET: SECRET,
    JWT_REFRESH_TOKEN_SECRET: "test-refresh-secret",
    NODE_ENV: "test",
    OPENAI_API_KEY: undefined,
    allowedOrigins: ["http://localhost:3000"],
  },
}));

vi.mock("express-rate-limit", () => ({
  rateLimit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockPrisma = {
  $queryRaw: vi.fn().mockResolvedValue([]),
  county: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
  constituency: { findMany: vi.fn().mockResolvedValue([]) },
  subCounty: { findMany: vi.fn().mockResolvedValue([]) },
  topic: { findMany: vi.fn().mockResolvedValue([]) },
  sentimentEvent: {
    groupBy: vi.fn().mockResolvedValue([]),
    aggregate: vi.fn().mockResolvedValue({ _avg: { sentimentScore: 0 } }),
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
  },
  alert: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  auditLog: { create: vi.fn().mockResolvedValue({}) },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));

const countiesRoutes = (await import("../../routes/counties")).default;
const dashboardRoutes = (await import("../../routes/dashboard")).default;
const topicsRoutes = (await import("../../routes/topics")).default;
const alertsRoutes = (await import("../../routes/alerts")).default;
const reportsRoutes = (await import("../../routes/reports")).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/counties", countiesRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/topics", topicsRoutes);
  app.use("/api/alerts", alertsRoutes);
  app.use("/api/reports", reportsRoutes);
  return app;
}

function token(payload: Record<string, unknown>, expiresIn: string | number = "15m") {
  return jwt.sign(payload, SECRET, { expiresIn } as jwt.SignOptions);
}

const NATIONAL = token({ id: "admin-1", role: UserRole.NATIONAL_ADMIN, countyId: null });
const ANALYST = token({ id: "analyst-1", role: UserRole.ANALYST, countyId: null });
const OFFICIAL_A = token({ id: "off-a", role: UserRole.COUNTY_OFFICIAL, countyId: "county-a" });
const OFFICIAL_NO_COUNTY = token({ id: "off-x", role: UserRole.COUNTY_OFFICIAL, countyId: null });
const EXPIRED = token({ id: "admin-1", role: UserRole.NATIONAL_ADMIN, countyId: null }, "-1h");

/**
 * Every endpoint that reads sentiment data. Each of these was reachable
 * without a token before this change, because `authenticate(true)` let an
 * anonymous request through and the scoping branches keyed off
 * `req.user?.role`, which is false when there is no user.
 */
const DATA_ENDPOINTS = [
  "/api/counties/heatmap",
  "/api/counties/county-a/constituencies/heatmap",
  "/api/counties/county-a/subcounties/heatmap",
  "/api/dashboard/overview",
  "/api/dashboard/briefing",
  "/api/topics/summary",
  "/api/alerts",
  "/api/reports/weekly-summary",
  "/api/reports/county-comparison",
];

describe("authorization matrix", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.county.findMany.mockResolvedValue([]);
    mockPrisma.constituency.findMany.mockResolvedValue([]);
    mockPrisma.subCounty.findMany.mockResolvedValue([]);
    mockPrisma.topic.findMany.mockResolvedValue([]);
    mockPrisma.sentimentEvent.groupBy.mockResolvedValue([]);
    mockPrisma.sentimentEvent.aggregate.mockResolvedValue({ _avg: { sentimentScore: 0 } });
    mockPrisma.sentimentEvent.count.mockResolvedValue(0);
    mockPrisma.sentimentEvent.findMany.mockResolvedValue([]);
    mockPrisma.alert.findMany.mockResolvedValue([]);
    mockPrisma.alert.count.mockResolvedValue(0);
    mockPrisma.auditLog.create.mockResolvedValue({});
    app = buildApp();
  });

  describe.each(DATA_ENDPOINTS)("%s", (path) => {
    it("rejects an unauthenticated request with 401", async () => {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    });

    it("rejects an expired token with 401", async () => {
      const res = await request(app).get(path).set("Authorization", `Bearer ${EXPIRED}`);
      expect(res.status).toBe(401);
    });

    it("rejects a malformed token with 401", async () => {
      const res = await request(app).get(path).set("Authorization", "Bearer not-a-jwt");
      expect(res.status).toBe(401);
    });

    it("rejects a token signed with the wrong secret with 401", async () => {
      const forged = jwt.sign({ id: "x", role: UserRole.NATIONAL_ADMIN }, "wrong-secret");
      const res = await request(app).get(path).set("Authorization", `Bearer ${forged}`);
      expect(res.status).toBe(401);
    });
  });

  // A county official whose countyId was cleared previously fell through every
  // scoping branch and received national data.
  describe.each(
    DATA_ENDPOINTS.filter((p) => p !== "/api/reports/county-comparison")
  )("%s with a county-less official", (path) => {
    it("returns 403 rather than national data", async () => {
      const res = await request(app)
        .get(path)
        .set("Authorization", `Bearer ${OFFICIAL_NO_COUNTY}`);
      expect(res.status).toBe(403);
    });
  });

  it("denies a county official another county's constituency drill-down", async () => {
    const res = await request(app)
      .get("/api/counties/county-b/constituencies/heatmap")
      .set("Authorization", `Bearer ${OFFICIAL_A}`);
    expect(res.status).toBe(403);
  });

  it("denies a county official another county's subcounty drill-down", async () => {
    const res = await request(app)
      .get("/api/counties/county-b/subcounties/heatmap")
      .set("Authorization", `Bearer ${OFFICIAL_A}`);
    expect(res.status).toBe(403);
  });

  it("allows a county official its own county's drill-down", async () => {
    const res = await request(app)
      .get("/api/counties/county-a/subcounties/heatmap")
      .set("Authorization", `Bearer ${OFFICIAL_A}`);
    expect(res.status).toBe(200);
  });

  it("denies a county official the national AI briefing", async () => {
    const res = await request(app)
      .get("/api/dashboard/briefing")
      .set("Authorization", `Bearer ${OFFICIAL_A}`);
    expect(res.status).toBe(403);
  });

  it("denies a county official the national county comparison export", async () => {
    const res = await request(app)
      .get("/api/reports/county-comparison")
      .set("Authorization", `Bearer ${OFFICIAL_A}`);
    expect(res.status).toBe(403);
  });

  it("allows an analyst the county comparison export", async () => {
    const res = await request(app)
      .get("/api/reports/county-comparison")
      .set("Authorization", `Bearer ${ANALYST}`);
    expect(res.status).toBe(200);
  });
});

describe("county scoping is applied to queries", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.alert.findMany.mockResolvedValue([]);
    mockPrisma.alert.count.mockResolvedValue(0);
    mockPrisma.sentimentEvent.groupBy.mockResolvedValue([]);
    mockPrisma.auditLog.create.mockResolvedValue({});
    app = buildApp();
  });

  it("filters the alert list by the official's county", async () => {
    await request(app).get("/api/alerts").set("Authorization", `Bearer ${OFFICIAL_A}`);
    const where = mockPrisma.alert.findMany.mock.calls[0][0].where;
    expect(where.countyId).toBe("county-a");
  });

  it("does not filter the alert list for a national admin", async () => {
    await request(app).get("/api/alerts").set("Authorization", `Bearer ${NATIONAL}`);
    const where = mockPrisma.alert.findMany.mock.calls[0][0].where;
    expect(where.countyId).toBeUndefined();
  });

  // ?countyId= must not be a way for an official to read another county.
  it("ignores a countyId query param supplied by a county official", async () => {
    await request(app)
      .get("/api/topics/summary?countyId=county-b")
      .set("Authorization", `Bearer ${OFFICIAL_A}`);
    const where = mockPrisma.sentimentEvent.groupBy.mock.calls[0][0].where;
    expect(where.countyId).toBe("county-a");
  });

  it("honours a countyId query param for a national admin", async () => {
    await request(app)
      .get("/api/topics/summary?countyId=county-b")
      .set("Authorization", `Bearer ${NATIONAL}`);
    const where = mockPrisma.sentimentEvent.groupBy.mock.calls[0][0].where;
    expect(where.countyId).toBe("county-b");
  });

  it("scopes the weekly summary export to the official's county", async () => {
    await request(app)
      .get("/api/reports/weekly-summary")
      .set("Authorization", `Bearer ${OFFICIAL_A}`);
    const where = mockPrisma.sentimentEvent.groupBy.mock.calls[0][0].where;
    expect(where.countyId).toBe("county-a");
  });
});

describe("PATCH /api/alerts/:id/status ownership", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.auditLog.create.mockResolvedValue({});
    app = buildApp();
  });

  it("denies a county official an alert belonging to another county", async () => {
    mockPrisma.alert.findUnique.mockResolvedValue({ id: "a1", countyId: "county-b" });
    const res = await request(app)
      .patch("/api/alerts/a1/status")
      .set("Authorization", `Bearer ${OFFICIAL_A}`)
      .send({ status: "RESOLVED" });

    expect(res.status).toBe(403);
    expect(mockPrisma.alert.update).not.toHaveBeenCalled();
  });

  it("allows a county official an alert in its own county", async () => {
    mockPrisma.alert.findUnique.mockResolvedValue({ id: "a2", countyId: "county-a" });
    mockPrisma.alert.update.mockResolvedValue({ id: "a2", status: "RESOLVED" });
    const res = await request(app)
      .patch("/api/alerts/a2/status")
      .set("Authorization", `Bearer ${OFFICIAL_A}`)
      .send({ status: "RESOLVED" });

    expect(res.status).toBe(200);
    expect(mockPrisma.alert.update).toHaveBeenCalled();
  });

  it("allows a national admin any county's alert", async () => {
    mockPrisma.alert.findUnique.mockResolvedValue({ id: "a3", countyId: "county-z" });
    mockPrisma.alert.update.mockResolvedValue({ id: "a3", status: "ACKNOWLEDGED" });
    const res = await request(app)
      .patch("/api/alerts/a3/status")
      .set("Authorization", `Bearer ${NATIONAL}`)
      .send({ status: "ACKNOWLEDGED" });

    expect(res.status).toBe(200);
  });

  it("returns 404 for an unknown alert without updating", async () => {
    mockPrisma.alert.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .patch("/api/alerts/missing/status")
      .set("Authorization", `Bearer ${NATIONAL}`)
      .send({ status: "RESOLVED" });

    expect(res.status).toBe(404);
    expect(mockPrisma.alert.update).not.toHaveBeenCalled();
  });
});

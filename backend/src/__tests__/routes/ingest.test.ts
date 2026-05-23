import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const VALID_KEY = "test-scraper-api-key-32-chars-xxx";

vi.mock("../../config/env", () => ({
  env: {
    SCRAPER_API_KEY: VALID_KEY,
    INGEST_RATE_LIMIT_RPM: "100",
    NODE_ENV: "test",
  },
}));

// Mock rate limiter to be a no-op in tests
vi.mock("express-rate-limit", () => ({
  rateLimit: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock Prisma — provide the shapes used by the ingest route
const mockPrisma = {
  county: { findMany: vi.fn() },
  topic: { findMany: vi.fn() },
  sentimentEvent: { createMany: vi.fn() },
  auditLog: { create: vi.fn() },
};

vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));

// Import router after mocks are in place
const { default: ingestRouter } = await import("../../routes/ingest");

const app = express();
app.use(express.json());
app.use("/api/ingest", ingestRouter);

const VALID_EVENT = {
  countyName: "Nairobi",
  topicName: "Healthcare",
  sentimentScore: -0.6,
  sentimentLabel: "NEGATIVE",
  source: "nation.africa",
  timestamp: "2026-05-23T10:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.county.findMany.mockResolvedValue([
    { id: "c-047", name: "Nairobi", code: "047" },
  ]);
  mockPrisma.topic.findMany.mockResolvedValue([
    { id: "t-001", name: "Healthcare" },
  ]);
  mockPrisma.sentimentEvent.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("POST /api/ingest/events", () => {
  it("returns 401 when X-API-Key header is missing", async () => {
    const res = await request(app)
      .post("/api/ingest/events")
      .send({ events: [VALID_EVENT] });

    expect(res.status).toBe(401);
  });

  it("returns 401 when X-API-Key header has the wrong value", async () => {
    const res = await request(app)
      .post("/api/ingest/events")
      .set("X-API-Key", "completely-wrong-key-value-here")
      .send({ events: [VALID_EVENT] });

    expect(res.status).toBe(401);
  });

  it("returns 400 when request body is missing the events array", async () => {
    const res = await request(app)
      .post("/api/ingest/events")
      .set("X-API-Key", VALID_KEY)
      .send({ notEvents: [] });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message", "Validation error");
  });

  it("returns 400 when events array is empty", async () => {
    const res = await request(app)
      .post("/api/ingest/events")
      .set("X-API-Key", VALID_KEY)
      .send({ events: [] });

    expect(res.status).toBe(400);
  });

  it("inserts valid events and returns inserted count", async () => {
    const res = await request(app)
      .post("/api/ingest/events")
      .set("X-API-Key", VALID_KEY)
      .send({ events: [VALID_EVENT] });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ inserted: 1, skipped: [] });
    expect(mockPrisma.sentimentEvent.createMany).toHaveBeenCalledOnce();
  });

  it("skips events with unknown county names and reports them", async () => {
    const res = await request(app)
      .post("/api/ingest/events")
      .set("X-API-Key", VALID_KEY)
      .send({
        events: [
          VALID_EVENT,
          { ...VALID_EVENT, countyName: "NonExistentCounty" },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.inserted).toBe(1);
    expect(res.body.skipped).toHaveLength(1);
    expect(res.body.skipped[0]).toMatchObject({ index: 1 });
  });

  it("skips events with unknown topic names and reports them", async () => {
    const res = await request(app)
      .post("/api/ingest/events")
      .set("X-API-Key", VALID_KEY)
      .send({
        events: [{ ...VALID_EVENT, topicName: "Unknown Topic" }],
      });

    expect(res.status).toBe(201);
    expect(res.body.inserted).toBe(0);
    expect(res.body.skipped).toHaveLength(1);
  });

  it("resolves county by code when countyCode is provided instead of countyName", async () => {
    const res = await request(app)
      .post("/api/ingest/events")
      .set("X-API-Key", VALID_KEY)
      .send({
        events: [{ ...VALID_EVENT, countyName: undefined, countyCode: "047" }],
      });

    expect(res.status).toBe(201);
    expect(res.body.inserted).toBe(1);
  });
});

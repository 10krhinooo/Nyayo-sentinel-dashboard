import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const mockPrisma = { auditLog: { create: vi.fn() } };
vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));

const { audit } = await import("../../middleware/audit");

function appReturning(status: number) {
  const app = express();
  app.get("/thing/:id", audit("DO_THING", "THING"), (_req, res) => {
    res.status(status).json({ ok: status < 400 });
  });
  return app;
}

async function metadataFor(status: number) {
  await request(appReturning(status)).get("/thing/abc");
  // The write happens on the response "finish" event.
  await new Promise((r) => setImmediate(r));
  return mockPrisma.auditLog.create.mock.calls[0]?.[0]?.data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("audit middleware", () => {
  it("records a successful request", async () => {
    const data = await metadataFor(200);
    expect(data.action).toBe("DO_THING");
    expect(data.resourceType).toBe("THING");
    expect(data.resourceId).toBe("abc");
    expect(data.metadata.outcome).toBe("SUCCESS");
  });

  // These were dropped entirely before: the early return on non-2xx meant a
  // failed login or a denied request left no trace at all.
  it("records a denied request", async () => {
    const data = await metadataFor(403);
    expect(data.metadata.statusCode).toBe(403);
    expect(data.metadata.outcome).toBe("DENIED");
  });

  it("records an unauthenticated rejection", async () => {
    const data = await metadataFor(401);
    expect(data.metadata.outcome).toBe("DENIED");
  });

  it("records a server error", async () => {
    const data = await metadataFor(500);
    expect(data.metadata.outcome).toBe("ERROR");
  });

  it("records a redirect as a success", async () => {
    const data = await metadataFor(302);
    expect(data.metadata.outcome).toBe("SUCCESS");
  });

  it("captures method, path and duration", async () => {
    const data = await metadataFor(200);
    expect(data.metadata.method).toBe("GET");
    expect(data.metadata.path).toBe("/thing/abc");
    expect(typeof data.metadata.durationMs).toBe("number");
  });

  // A rejected write used to surface as an unhandled rejection, which can
  // terminate the process on a transient database error.
  it("swallows a database failure instead of rejecting", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mockPrisma.auditLog.create.mockRejectedValue(new Error("db down"));

    const res = await request(appReturning(200)).get("/thing/abc");
    await new Promise((r) => setImmediate(r));

    expect(res.status).toBe(200);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("records an anonymous request with no userId", async () => {
    const data = await metadataFor(401);
    expect(data.userId).toBeUndefined();
  });
});

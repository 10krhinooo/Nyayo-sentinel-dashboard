import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// Mutable env object — tests mutate SCRAPER_API_KEY to test different scenarios
const mockEnv = vi.hoisted(() => ({
  SCRAPER_API_KEY: "test-scraper-api-key-32-chars-xxx" as string | undefined,
}));

vi.mock("../../config/env", () => ({ env: mockEnv }));

const { requireApiKey } = await import("../../middleware/apiKey");

function makeReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function makeRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as unknown as Response;
}

const VALID_KEY = "test-scraper-api-key-32-chars-xxx";

beforeEach(() => {
  mockEnv.SCRAPER_API_KEY = VALID_KEY;
});

describe("requireApiKey middleware", () => {
  it("returns 503 when SCRAPER_API_KEY is not configured", () => {
    mockEnv.SCRAPER_API_KEY = undefined;
    const req = makeReq({ "x-api-key": VALID_KEY });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    requireApiKey(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when X-API-Key header is absent", () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    requireApiKey(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the provided key is incorrect", () => {
    const req = makeReq({ "x-api-key": "wrong-key-value-here-32-chars-xx" });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    requireApiKey(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the provided key has wrong length (timingSafeEqual guard)", () => {
    const req = makeReq({ "x-api-key": "short-key" });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    requireApiKey(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when the correct API key is provided", () => {
    const req = makeReq({ "x-api-key": VALID_KEY });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    requireApiKey(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((res.status as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

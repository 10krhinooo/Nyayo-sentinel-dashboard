import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const TEST_SECRET = "test-access-secret-at-least-32-chars";

vi.mock("../../config/env", () => ({
  env: { JWT_ACCESS_TOKEN_SECRET: TEST_SECRET },
}));

// Import after mock is registered
const { authenticate, requireRoles } = await import("../../middleware/auth");

function makeReq(overrides: Record<string, unknown> = {}): Request {
  return { headers: {}, cookies: {}, ...overrides } as unknown as Request;
}

function makeRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as unknown as Response;
}

function signToken(payload: object, expiresIn: string | number = "1h"): string {
  return jwt.sign(payload, TEST_SECRET, { expiresIn } as jwt.SignOptions);
}

describe("authenticate middleware", () => {
  it("returns 401 when no token is present", () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    authenticate()(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("verifies token from Authorization Bearer header and sets req.user", () => {
    const token = signToken({ id: "user-1", role: "NATIONAL_ADMIN", countyId: null });
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    authenticate()(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as unknown as { user: { id: string } }).user).toMatchObject({
      id: "user-1",
      role: "NATIONAL_ADMIN",
    });
  });

  it("verifies token from nyayo_access_token cookie and sets req.user", () => {
    const token = signToken({ id: "user-2", role: "COUNTY_OFFICIAL", countyId: "c-1" });
    const req = makeReq({ cookies: { nyayo_access_token: token } });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    authenticate()(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as unknown as { user: { id: string } }).user).toMatchObject({
      id: "user-2",
      role: "COUNTY_OFFICIAL",
      countyId: "c-1",
    });
  });

  it("returns 401 for an invalid (malformed) token", () => {
    const req = makeReq({ headers: { authorization: "Bearer not.a.valid.token" } });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    authenticate()(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 for an expired token", () => {
    const token = signToken({ id: "user-1", role: "ANALYST", countyId: null }, "-1s");
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    authenticate()(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("optional mode: calls next without setting req.user when no token present", () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    authenticate(true)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as unknown as { user?: unknown }).user).toBeUndefined();
  });

  it("optional mode: calls next without error when token is invalid", () => {
    const req = makeReq({ headers: { authorization: "Bearer garbage.token.data" } });
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    authenticate(true)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as unknown as { user?: unknown }).user).toBeUndefined();
  });
});

describe("requireRoles middleware", () => {
  it("returns 401 when req.user is absent", () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    requireRoles(["NATIONAL_ADMIN"])(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when user role is not in the allowed list", () => {
    const req = makeReq();
    (req as unknown as { user: object }).user = { id: "u", role: "ANALYST", countyId: null };
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    requireRoles(["NATIONAL_ADMIN", "COUNTY_OFFICIAL"])(req, res, next);

    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when user role is in the allowed list", () => {
    const req = makeReq();
    (req as unknown as { user: object }).user = { id: "u", role: "NATIONAL_ADMIN", countyId: null };
    const res = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    requireRoles(["NATIONAL_ADMIN", "COUNTY_OFFICIAL"])(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((res.status as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

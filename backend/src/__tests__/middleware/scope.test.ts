import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { UserRole } from "@prisma/client";

vi.mock("../../config/env", () => ({
  env: { JWT_ACCESS_TOKEN_SECRET: "test-secret", NODE_ENV: "test" },
}));

const { resolveScope, countyWhere, canAccessCounty } = await import(
  "../../middleware/scope"
);

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: any };
}

function run(user: unknown) {
  const req = { user } as Request;
  const res = makeRes();
  const next = vi.fn() as unknown as NextFunction;
  resolveScope()(req, res, next);
  return { req, res, next: next as unknown as ReturnType<typeof vi.fn> };
}

describe("resolveScope", () => {
  it("rejects an unauthenticated request with 401", () => {
    const { res, next } = run(undefined);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("gives NATIONAL_ADMIN national scope", () => {
    const { req, next } = run({ id: "u1", role: UserRole.NATIONAL_ADMIN, countyId: null });
    expect(next).toHaveBeenCalled();
    expect(req.scope).toEqual({ countyId: null, national: true });
  });

  it("gives ANALYST national scope", () => {
    const { req, next } = run({ id: "u2", role: UserRole.ANALYST, countyId: null });
    expect(next).toHaveBeenCalled();
    expect(req.scope).toEqual({ countyId: null, national: true });
  });

  it("pins COUNTY_OFFICIAL to its own county", () => {
    const { req, next } = run({ id: "u3", role: UserRole.COUNTY_OFFICIAL, countyId: "county-a" });
    expect(next).toHaveBeenCalled();
    expect(req.scope).toEqual({ countyId: "county-a", national: false });
  });

  // The regression this whole module exists to prevent.
  it("fails closed for a COUNTY_OFFICIAL with no county rather than granting national scope", () => {
    for (const countyId of [null, undefined, ""]) {
      const { req, res, next } = run({ id: "u4", role: UserRole.COUNTY_OFFICIAL, countyId });
      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
      expect(req.scope).toBeUndefined();
    }
  });
});

describe("countyWhere", () => {
  it("returns an empty filter for national scope", () => {
    const req = { scope: { countyId: null, national: true } } as Request;
    expect(countyWhere(req)).toEqual({});
  });

  it("returns a countyId filter for county scope", () => {
    const req = { scope: { countyId: "county-a", national: false } } as Request;
    expect(countyWhere(req)).toEqual({ countyId: "county-a" });
  });

  it("throws rather than returning an unscoped filter when scope is missing", () => {
    const req = {} as Request;
    expect(() => countyWhere(req)).toThrow(/resolveScope/);
  });
});

describe("canAccessCounty", () => {
  const national = { scope: { countyId: null, national: true } } as Request;
  const official = { scope: { countyId: "county-a", national: false } } as Request;

  it("lets national scope reach any county", () => {
    expect(canAccessCounty(national, "county-a")).toBe(true);
    expect(canAccessCounty(national, "county-b")).toBe(true);
  });

  it("lets a county official reach only its own county", () => {
    expect(canAccessCounty(official, "county-a")).toBe(true);
    expect(canAccessCounty(official, "county-b")).toBe(false);
  });

  it("denies a county official a null or undefined county", () => {
    expect(canAccessCounty(official, null)).toBe(false);
    expect(canAccessCounty(official, undefined)).toBe(false);
  });

  it("throws when scope is missing", () => {
    expect(() => canAccessCounty({} as Request, "county-a")).toThrow(/resolveScope/);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { getUser, setUser, clearUser, type AuthUser } from "../../lib/auth";

const SAMPLE_USER: AuthUser = {
  id: "user-123",
  email: "test@example.com",
  firstName: "Jane",
  lastName: "Doe",
  role: "NATIONAL_ADMIN",
  countyId: null,
};

beforeEach(() => {
  localStorage.clear();
});

describe("getUser", () => {
  it("returns null when localStorage has no user entry", () => {
    expect(getUser()).toBeNull();
  });

  it("returns null for malformed JSON in localStorage", () => {
    localStorage.setItem("nyayo_user", "{not-valid-json}");
    expect(getUser()).toBeNull();
  });
});

describe("setUser / getUser round-trip", () => {
  it("stores and retrieves a user correctly", () => {
    setUser(SAMPLE_USER);
    const retrieved = getUser();
    expect(retrieved).toEqual(SAMPLE_USER);
  });

  it("overwrites a previously stored user", () => {
    setUser(SAMPLE_USER);
    const updated: AuthUser = { ...SAMPLE_USER, role: "ANALYST" };
    setUser(updated);
    expect(getUser()?.role).toBe("ANALYST");
  });

  it("preserves optional fields that are null or undefined", () => {
    const userWithoutNames: AuthUser = {
      id: "u-2",
      email: "a@b.com",
      firstName: null,
      lastName: null,
      role: "COUNTY_OFFICIAL",
      countyId: "c-001",
    };
    setUser(userWithoutNames);
    expect(getUser()).toEqual(userWithoutNames);
  });
});

describe("clearUser", () => {
  it("removes the user so getUser returns null", () => {
    setUser(SAMPLE_USER);
    clearUser();
    expect(getUser()).toBeNull();
  });

  it("is a no-op when no user was stored", () => {
    expect(() => clearUser()).not.toThrow();
    expect(getUser()).toBeNull();
  });
});

describe("SSR safety (typeof window === 'undefined' guards)", () => {
  let savedWindow: typeof globalThis.window;

  beforeEach(() => {
    savedWindow = globalThis.window;
    // @ts-expect-error — simulate server-side environment where window is absent
    delete globalThis.window;
  });

  afterEach(() => {
    globalThis.window = savedWindow;
  });

  it("getUser returns null in SSR context", () => {
    expect(getUser()).toBeNull();
  });

  it("setUser is a no-op in SSR context (does not throw)", () => {
    expect(() => setUser(SAMPLE_USER)).not.toThrow();
  });

  it("clearUser is a no-op in SSR context (does not throw)", () => {
    expect(() => clearUser()).not.toThrow();
  });
});

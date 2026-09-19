import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { hashToken, issueToken, generateOtp, MAX_OTP_ATTEMPTS } from "../../lib/tokens";

describe("hashToken", () => {
  it("produces the SHA-256 hex digest of the input", () => {
    const expected = createHash("sha256").update("abc", "utf8").digest("hex");
    expect(hashToken("abc")).toBe(expected);
  });

  it("is deterministic", () => {
    expect(hashToken("same")).toBe(hashToken("same"));
  });

  it("differs for different inputs", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });

  it("never returns the input in the clear", () => {
    const token = "11111111-2222-3333-4444-555555555555";
    expect(hashToken(token)).not.toContain(token);
  });

  // The migration hashes existing plaintext columns in Postgres with
  // encode(sha256(convert_to(t,'UTF8')),'hex'). If these two ever disagree,
  // every invite and reset issued before the migration silently stops working.
  it("matches the digest the SQL migration computes", () => {
    expect(hashToken("11111111-2222-3333-4444-555555555555")).toBe(
      "666ff6ccaa5b3c07feaa3a95d3a4bd2c46ac9e9abdb09ca9133528d3dc1e8952"
    );
  });
});

describe("issueToken", () => {
  it("returns a token with its matching hash", () => {
    const { token, hash } = issueToken();
    expect(hash).toBe(hashToken(token));
  });

  it("returns a distinct token each time", () => {
    const seen = new Set(Array.from({ length: 50 }, () => issueToken().token));
    expect(seen.size).toBe(50);
  });

  it("issues a UUID-shaped token", () => {
    expect(issueToken().token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});

describe("generateOtp", () => {
  it("always returns exactly six digits", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });

  it("stays within 100000-999999 so it is never zero padded or short", () => {
    for (let i = 0; i < 500; i++) {
      const n = Number(generateOtp());
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });

  it("does not repeat trivially", () => {
    const seen = new Set(Array.from({ length: 200 }, generateOtp));
    expect(seen.size).toBeGreaterThan(150);
  });
});

describe("MAX_OTP_ATTEMPTS", () => {
  it("is a small positive bound", () => {
    expect(MAX_OTP_ATTEMPTS).toBeGreaterThan(0);
    expect(MAX_OTP_ATTEMPTS).toBeLessThanOrEqual(10);
  });
});

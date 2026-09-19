import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const ACCESS_SECRET = "test-access-secret-at-least-32-characters";
const REFRESH_SECRET = "test-refresh-secret-at-least-32-chars";

vi.mock("../../config/env", () => ({
  env: {
    LOG_LEVEL: "silent",
    JWT_ACCESS_TOKEN_SECRET: ACCESS_SECRET,
    JWT_REFRESH_TOKEN_SECRET: REFRESH_SECRET,
    CSRF_SECRET: "test-csrf-secret-at-least-32-characters",
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 604800,
    NODE_ENV: "test",
  },
}));

const sent = {
  otp: vi.fn().mockResolvedValue(undefined),
  welcome: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn().mockResolvedValue(undefined),
  changed: vi.fn().mockResolvedValue(undefined),
};
vi.mock("../../services/email", () => ({
  sendOtpEmail: (...a: unknown[]) => sent.otp(...a),
  sendWelcomeEmail: (...a: unknown[]) => sent.welcome(...a),
  sendPasswordResetEmail: (...a: unknown[]) => sent.reset(...a),
  sendPasswordChangedEmail: (...a: unknown[]) => sent.changed(...a),
}));

const mockPrisma = {
  user: { findUnique: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  revokedToken: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  auditLog: { create: vi.fn().mockResolvedValue({}) },
};
vi.mock("../../lib/prisma", () => ({ prisma: mockPrisma }));

const authRoutes = (await import("../../routes/auth")).default;
const { hashToken } = await import("../../lib/tokens");

function buildApp() {
  const app = express();
  app.use(express.json());
  // Minimal cookie parsing; the routes read req.cookies directly.
  app.use((req, _res, next) => {
    const header = req.headers.cookie ?? "";
    (req as express.Request & { cookies: Record<string, string> }).cookies =
      Object.fromEntries(
        header
          .split(";")
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => {
            const i = c.indexOf("=");
            return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
          })
      );
    next();
  });
  app.use("/api/auth", authRoutes);
  return app;
}

function baseUser(over: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "user@example.ke",
    passwordHash: bcrypt.hashSync("correct-horse", 10),
    role: "NATIONAL_ADMIN",
    countyId: null,
    mfaEnabled: false,
    mustSetPassword: false,
    otpCode: null,
    otpExpiry: null,
    otpAttempts: 0,
    firstName: "A",
    lastName: "B",
    ...over,
  };
}

let app: express.Express;
beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.user.update.mockResolvedValue({});
  mockPrisma.revokedToken.upsert.mockResolvedValue({});
  mockPrisma.revokedToken.deleteMany.mockResolvedValue({ count: 0 });
  app = buildApp();
});

describe("POST /auth/login", () => {
  it("rejects a wrong password with 401", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser());
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.ke", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown email with the same 401, not a distinguishable error", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.ke", password: "whatever" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid credentials");
  });

  it("issues cookies for a valid non-MFA login", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser());
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.ke", password: "correct-horse" });

    expect(res.status).toBe(200);
    const cookies = String(res.headers["set-cookie"]);
    expect(cookies).toContain("nyayo_access_token");
    expect(cookies).toContain("nyayo_refresh_token");
    expect(cookies).toContain("HttpOnly");
  });

  // httpOnly cookies are pointless if the same value is also readable by script.
  it("does not echo tokens in the response body", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser());
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.ke", password: "correct-horse" });

    expect(res.body.tokens).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("eyJ");
  });

  it("requires password setup when mustSetPassword is set", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ mustSetPassword: true }));
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.ke", password: "correct-horse" });
    expect(res.status).toBe(403);
    expect(res.body.requiresPasswordSetup).toBe(true);
  });

  it("sends an OTP and resets the attempt counter when MFA is enabled", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ mfaEnabled: true, otpAttempts: 4 }));
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.ke", password: "correct-horse" });

    expect(res.status).toBe(200);
    expect(res.body.requiresOtp).toBe(true);
    expect(sent.otp).toHaveBeenCalled();
    expect(mockPrisma.user.update.mock.calls[0][0].data.otpAttempts).toBe(0);
  });

  it("stores the OTP hashed, never in the clear", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ mfaEnabled: true }));
    await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.ke", password: "correct-horse" });

    const stored = mockPrisma.user.update.mock.calls[0][0].data.otpCode as string;
    const emailed = sent.otp.mock.calls[0][1] as string;
    expect(stored).not.toBe(emailed);
    expect(bcrypt.compareSync(emailed, stored)).toBe(true);
  });
});

describe("POST /auth/verify-otp", () => {
  function userWithOtp(code: string, over: Record<string, unknown> = {}) {
    return baseUser({
      mfaEnabled: true,
      otpCode: bcrypt.hashSync(code, 10),
      otpExpiry: new Date(Date.now() + 10 * 60 * 1000),
      ...over,
    });
  }

  it("accepts the correct code and clears it", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userWithOtp("123456"));
    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ email: "user@example.ke", otp: "123456" });

    expect(res.status).toBe(200);
    const data = mockPrisma.user.update.mock.calls[0][0].data;
    expect(data.otpCode).toBeNull();
    expect(data.otpAttempts).toBe(0);
  });

  it("rejects an expired code", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      userWithOtp("123456", { otpExpiry: new Date(Date.now() - 1000) })
    );
    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ email: "user@example.ke", otp: "123456" });
    expect(res.status).toBe(401);
  });

  it("increments the attempt counter on a wrong code", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userWithOtp("123456", { otpAttempts: 1 }));
    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ email: "user@example.ke", otp: "000000" });

    expect(res.status).toBe(401);
    expect(mockPrisma.user.update.mock.calls[0][0].data.otpAttempts).toBe(2);
  });

  // Without this bound a six digit code is exhaustible.
  it("burns the code once the attempt limit is reached", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userWithOtp("123456", { otpAttempts: 4 }));
    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ email: "user@example.ke", otp: "000000" });

    expect(res.status).toBe(401);
    const data = mockPrisma.user.update.mock.calls[0][0].data;
    expect(data.otpCode).toBeNull();
    expect(data.otpExpiry).toBeNull();
  });

  it("refuses further attempts once the counter is exhausted", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userWithOtp("123456", { otpAttempts: 5 }));
    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ email: "user@example.ke", otp: "123456" });

    expect(res.status).toBe(429);
  });

  it("does not echo tokens in the body", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(userWithOtp("123456"));
    const res = await request(app)
      .post("/api/auth/verify-otp")
      .send({ email: "user@example.ke", otp: "123456" });
    expect(res.body.tokens).toBeUndefined();
  });
});

describe("password reset", () => {
  it("stores only the hash and emails the plaintext", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser());
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "user@example.ke" });

    expect(res.status).toBe(200);
    const stored = mockPrisma.user.update.mock.calls[0][0].data.resetTokenHash as string;
    const emailed = sent.reset.mock.calls[0][1] as string;
    expect(stored).toBe(hashToken(emailed));
    expect(stored).not.toBe(emailed);
  });

  it("returns the same response for an unknown email", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.ke" });

    expect(res.status).toBe(200);
    expect(sent.reset).not.toHaveBeenCalled();
  });

  it("looks the reset token up by hash, not by the raw value", async () => {
    const token = randomUUID();
    mockPrisma.user.findUnique.mockResolvedValue(
      baseUser({ resetTokenExpiry: new Date(Date.now() + 60_000) })
    );
    await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "new-password-123" });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { resetTokenHash: hashToken(token) },
    });
  });

  it("rejects an expired reset token", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      baseUser({ resetTokenExpiry: new Date(Date.now() - 1000) })
    );
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: randomUUID(), password: "new-password-123" });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown reset token", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: randomUUID(), password: "new-password-123" });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/set-password", () => {
  it("looks the invite token up by hash", async () => {
    const token = randomUUID();
    mockPrisma.user.findUnique.mockResolvedValue(
      baseUser({ inviteTokenExpiry: new Date(Date.now() + 60_000) })
    );
    await request(app)
      .post("/api/auth/set-password")
      .send({ token, password: "new-password-123" });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { inviteTokenHash: hashToken(token) },
    });
  });

  it("rejects an expired invite", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(
      baseUser({ inviteTokenExpiry: new Date(Date.now() - 1000) })
    );
    const res = await request(app)
      .post("/api/auth/set-password")
      .send({ token: randomUUID(), password: "new-password-123" });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/token/refresh", () => {
  function refreshCookie(payload: Record<string, unknown>, expiresIn: string | number = "7d") {
    const t = jwt.sign(payload, REFRESH_SECRET, { expiresIn } as jwt.SignOptions);
    return `nyayo_refresh_token=${t}`;
  }

  it("rotates the token and denylists the one presented", async () => {
    const jti = randomUUID();
    mockPrisma.revokedToken.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(baseUser());

    const res = await request(app)
      .post("/api/auth/token/refresh")
      .set("Cookie", refreshCookie({ id: "u1", jti }));

    expect(res.status).toBe(204);
    expect(mockPrisma.revokedToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jti } })
    );
  });

  // Replay means the token leaked: the legitimate holder already spent it.
  it("refuses a token that has already been exchanged", async () => {
    const jti = randomUUID();
    mockPrisma.revokedToken.findUnique.mockResolvedValue({ jti });

    const res = await request(app)
      .post("/api/auth/token/refresh")
      .set("Cookie", refreshCookie({ id: "u1", jti }));

    expect(res.status).toBe(401);
  });

  it("refuses a legacy token with no jti, which cannot be revoked", async () => {
    const res = await request(app)
      .post("/api/auth/token/refresh")
      .set("Cookie", refreshCookie({ id: "u1" }));
    expect(res.status).toBe(401);
  });

  // The body fallback let script-readable state stand in for the httpOnly cookie.
  it("ignores a refresh token supplied in the request body", async () => {
    const t = jwt.sign({ id: "u1", jti: randomUUID() }, REFRESH_SECRET, { expiresIn: "7d" });
    const res = await request(app).post("/api/auth/token/refresh").send({ refreshToken: t });
    expect(res.status).toBe(401);
  });

  it("refuses a token signed with the wrong secret", async () => {
    const t = jwt.sign({ id: "u1", jti: randomUUID() }, "wrong-secret", { expiresIn: "7d" });
    const res = await request(app)
      .post("/api/auth/token/refresh")
      .set("Cookie", `nyayo_refresh_token=${t}`);
    expect(res.status).toBe(401);
  });

  it("refuses an expired token", async () => {
    const res = await request(app)
      .post("/api/auth/token/refresh")
      .set("Cookie", refreshCookie({ id: "u1", jti: randomUUID() }, "-1h"));
    expect(res.status).toBe(401);
  });

  it("refuses when the user no longer exists", async () => {
    mockPrisma.revokedToken.findUnique.mockResolvedValue(null);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post("/api/auth/token/refresh")
      .set("Cookie", refreshCookie({ id: "gone", jti: randomUUID() }));
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("denylists the refresh token rather than only clearing cookies", async () => {
    const jti = randomUUID();
    const t = jwt.sign({ id: "u1", jti }, REFRESH_SECRET, { expiresIn: "7d" });

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", `nyayo_refresh_token=${t}`);

    expect(res.status).toBe(204);
    expect(mockPrisma.revokedToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jti } })
    );
  });

  it("still clears cookies when no token is present", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(204);
    expect(mockPrisma.revokedToken.upsert).not.toHaveBeenCalled();
  });

  it("does not fail on a malformed token", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", "nyayo_refresh_token=not-a-jwt");
    expect(res.status).toBe(204);
  });
});

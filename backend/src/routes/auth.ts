import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { env } from "../config/env";
import { audit } from "../middleware/audit";
import { authenticateOptional } from "../middleware/auth";
import { hashToken, issueToken, generateOtp, MAX_OTP_ATTEMPTS } from "../lib/tokens";
import {
  sendOtpEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail
} from "../services/email";

const router = Router();

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function signTokens(user: { id: string; role: string; countyId: string | null }) {
  const accessToken = jwt.sign(
    { id: user.id, role: user.role, countyId: user.countyId },
    env.JWT_ACCESS_TOKEN_SECRET,
    { expiresIn: env.accessTokenTtlSeconds }
  );
  // jti makes an individual refresh token identifiable, and therefore
  // revocable. Without one a stolen token could not be distinguished from a
  // legitimate one and stayed valid for its full lifetime.
  const refreshToken = jwt.sign(
    { id: user.id, jti: randomUUID() },
    env.JWT_REFRESH_TOKEN_SECRET,
    { expiresIn: env.refreshTokenTtlSeconds }
  );
  return { accessToken, refreshToken };
}

/** Records a refresh token jti as spent so it cannot be replayed. */
async function revokeRefreshToken(jti: string, userId: string, exp?: number) {
  const expiresAt = exp
    ? new Date(exp * 1000)
    : new Date(Date.now() + env.refreshTokenTtlSeconds * 1000);
  await prisma.revokedToken.upsert({
    where: { jti },
    update: {},
    create: { jti, userId, expiresAt }
  });
}

function setTokenCookies(res: import("express").Response, tokens: TokenPair) {
  const isProduction = env.NODE_ENV === "production";
  res.cookie("nyayo_access_token", tokens.accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: env.accessTokenTtlSeconds * 1000
  });
  res.cookie("nyayo_refresh_token", tokens.refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: env.refreshTokenTtlSeconds * 1000
  });
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

// POST /auth/login — step 1: verify password, send email OTP
router.post("/login", audit("LOGIN", "USER"), async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten().fieldErrors });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.mustSetPassword) {
      return res.status(403).json({ message: "Password setup required", requiresPasswordSetup: true });
    }

    // Existing accounts (mfaEnabled: false) skip OTP and log in directly
    if (!user.mfaEnabled) {
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      const tokens = signTokens(user);
      setTokenCookies(res, tokens);
      // Tokens are delivered as httpOnly cookies only. Returning them in the
      // body as well handed them to any script on the page, which is exactly
      // what httpOnly exists to prevent.
      return res.json({
        user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, countyId: user.countyId }
      });
    }

    // New accounts (mfaEnabled: true) require email OTP
    const code = generateOtp();
    const hashedCode = await bcrypt.hash(code, 10);
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: hashedCode, otpExpiry: expiry, otpAttempts: 0 }
    });

    await sendOtpEmail(email, code);

    return res.json({ requiresOtp: true });
  } catch (err) {
    logger.error({ err }, "Auth handler failed");
    return res.status(500).json({ message: "Internal server error" });
  }
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6)
});

// POST /auth/verify-otp — step 2: verify OTP code, issue tokens
router.post("/verify-otp", audit("LOGIN", "USER"), async (req, res) => {
  try {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten().fieldErrors });
    }
    const { email, otp } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.otpCode || !user.otpExpiry) {
      return res.status(401).json({ message: "Invalid or expired code" });
    }

    if (user.otpExpiry < new Date()) {
      return res.status(401).json({ message: "Verification code has expired. Please log in again." });
    }

    // A six digit code has a million possibilities, which a rate limiter alone
    // only slows down. Counting attempts bounds the search per issued code.
    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
      await prisma.user.update({
        where: { id: user.id },
        data: { otpCode: null, otpExpiry: null, otpAttempts: 0 }
      });
      return res.status(429).json({
        message: "Too many incorrect codes. Please log in again to get a new one."
      });
    }

    const valid = await bcrypt.compare(otp, user.otpCode);
    if (!valid) {
      const attempts = user.otpAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data:
          attempts >= MAX_OTP_ATTEMPTS
            ? { otpCode: null, otpExpiry: null, otpAttempts: 0 }
            : { otpAttempts: attempts }
      });
      return res.status(401).json({ message: "Invalid verification code" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: null, otpExpiry: null, otpAttempts: 0, lastLoginAt: new Date() }
    });

    const tokens: TokenPair = signTokens(user);
    setTokenCookies(res, tokens);

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        countyId: user.countyId
      }
    });
  } catch (err) {
    logger.error({ err }, "Auth handler failed");
    return res.status(500).json({ message: "Internal server error" });
  }
});

const setPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8)
});

// POST /auth/set-password — set password via invite token
router.post("/set-password", async (req, res) => {
  try {
    const parsed = setPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten().fieldErrors });
    }
    const { token, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { inviteTokenHash: hashToken(token) }
    });

    if (!user || !user.inviteTokenExpiry || user.inviteTokenExpiry < new Date()) {
      return res.status(400).json({ message: "Invalid or expired invite link. Please contact your administrator." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        inviteTokenHash: null,
        inviteTokenExpiry: null,
        mustSetPassword: false
      }
    });

    await sendWelcomeEmail(user.email);

    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Auth handler failed");
    return res.status(500).json({ message: "Internal server error" });
  }
});

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

// POST /auth/forgot-password — send password reset email
router.post("/forgot-password", async (req, res) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request" });
    }
    const { email } = parsed.data;

    // Always return success to prevent enumeration
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && !user.mustSetPassword) {
      // The plaintext token goes out by email and is never persisted; only
      // its hash is stored, so a database read cannot be replayed as a reset.
      const { token, hash } = issueToken();
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await prisma.user.update({
        where: { id: user.id },
        data: { resetTokenHash: hash, resetTokenExpiry: expiry }
      });
      await sendPasswordResetEmail(email, token);
    }

    return res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    logger.error({ err }, "Auth handler failed");
    return res.status(500).json({ message: "Internal server error" });
  }
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8)
});

// POST /auth/reset-password — reset password via token
router.post("/reset-password", async (req, res) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten().fieldErrors });
    }
    const { token, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { resetTokenHash: hashToken(token) }
    });
    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return res.status(400).json({ message: "Invalid or expired reset link. Please request a new one." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetTokenHash: null, resetTokenExpiry: null }
    });

    await sendPasswordChangedEmail(user.email);

    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Auth handler failed");
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/token/refresh", audit("TOKEN_REFRESH", "USER"), async (req, res) => {
  try {
    // Cookie only. The previous body fallback let a caller present a token
    // from JavaScript, which defeats the point of the httpOnly cookie.
    const refreshToken = (
      req as Request & { cookies?: Record<string, string> }
    ).cookies?.nyayo_refresh_token;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token required" });
    }

    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_TOKEN_SECRET) as {
      id: string;
      jti?: string;
      exp?: number;
    };

    // Tokens issued before jti existed cannot be tracked, so they are refused
    // rather than trusted. The holder simply logs in again.
    if (!decoded.jti) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    const spent = await prisma.revokedToken.findUnique({ where: { jti: decoded.jti } });
    if (spent) {
      // A replayed token means the token was captured, since the legitimate
      // holder already exchanged it. Revoke the whole family.
      await prisma.revokedToken.deleteMany({
        where: { userId: decoded.id, expiresAt: { lt: new Date() } }
      });
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      return res.status(401).json({ message: "Invalid token" });
    }

    // Rotate: the presented token is spent the moment it is exchanged.
    await revokeRefreshToken(decoded.jti, user.id, decoded.exp);

    const tokens = signTokens(user);
    setTokenCookies(res, tokens);
    return res.status(204).send();
  } catch (err) {
    // An expired or tampered token is an ordinary outcome here, not a fault,
    // so this is debug rather than error. It is still recorded, because a
    // sudden rise in rejections is worth being able to see.
    logger.debug({ err }, "Refresh token rejected");
    return res.status(401).json({ message: "Invalid or expired refresh token" });
  }
});

router.post("/logout", authenticateOptional(), audit("LOGOUT", "USER"), async (req, res) => {
  // Logout previously cleared cookies and nothing else, so a token already
  // copied elsewhere kept working until it expired on its own.
  const refreshToken = (
    req as Request & { cookies?: Record<string, string> }
  ).cookies?.nyayo_refresh_token;

  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_TOKEN_SECRET) as {
        id: string;
        jti?: string;
        exp?: number;
      };
      if (decoded.jti) {
        await revokeRefreshToken(decoded.jti, decoded.id, decoded.exp);
      }
    } catch {
      // An expired or malformed token is already unusable; clearing the
      // cookies below is all that is left to do.
    }
  }

  res.clearCookie("nyayo_access_token");
  res.clearCookie("nyayo_refresh_token");
  return res.status(204).send();
});

export default router;

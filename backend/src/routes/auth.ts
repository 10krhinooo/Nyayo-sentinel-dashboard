import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { audit } from "../middleware/audit";
import { authenticate } from "../middleware/auth";
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
  const refreshToken = jwt.sign(
    { id: user.id },
    env.JWT_REFRESH_TOKEN_SECRET,
    { expiresIn: env.refreshTokenTtlSeconds }
  );
  return { accessToken, refreshToken };
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

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
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
      return res.json({
        user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, countyId: user.countyId },
        tokens
      });
    }

    // New accounts (mfaEnabled: true) require email OTP
    const code = generateOtp();
    const hashedCode = await bcrypt.hash(code, 10);
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: hashedCode, otpExpiry: expiry }
    });

    await sendOtpEmail(email, code);

    return res.json({ requiresOtp: true });
  } catch {
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

    const valid = await bcrypt.compare(otp, user.otpCode);
    if (!valid) {
      return res.status(401).json({ message: "Invalid verification code" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: null, otpExpiry: null, lastLoginAt: new Date() }
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
      },
      tokens
    });
  } catch {
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

    const user = await prisma.user.findFirst({
      where: { inviteToken: token }
    });

    if (!user || !user.inviteTokenExpiry || user.inviteTokenExpiry < new Date()) {
      return res.status(400).json({ message: "Invalid or expired invite link. Please contact your administrator." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        inviteToken: null,
        inviteTokenExpiry: null,
        mustSetPassword: false
      }
    });

    await sendWelcomeEmail(user.email);

    return res.json({ success: true });
  } catch {
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
      const token = randomUUID();
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken: token, resetTokenExpiry: expiry }
      });
      await sendPasswordResetEmail(email, token);
    }

    return res.json({ message: "If that email exists, a reset link has been sent." });
  } catch {
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

    const user = await prisma.user.findFirst({ where: { resetToken: token } });
    if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return res.status(400).json({ message: "Invalid or expired reset link. Please request a new one." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null }
    });

    await sendPasswordChangedEmail(user.email);

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/token/refresh", audit("TOKEN_REFRESH", "USER"), async (req, res) => {
  try {
    const refreshToken =
      (req as any).cookies?.nyayo_refresh_token as string | undefined
      ?? (req.body as { refreshToken?: string }).refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }

    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_TOKEN_SECRET) as { id: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const tokens = signTokens(user);
    setTokenCookies(res, tokens);
    return res.json({ tokens });
  } catch {
    return res.status(401).json({ message: "Invalid or expired refresh token" });
  }
});

router.post("/logout", authenticate(true), audit("LOGOUT", "USER"), async (_req, res) => {
  res.clearCookie("nyayo_access_token");
  res.clearCookie("nyayo_refresh_token");
  return res.status(204).send();
});

export default router;

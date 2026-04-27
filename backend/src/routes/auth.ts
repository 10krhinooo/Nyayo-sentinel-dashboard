import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { authenticator } from "otplib";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { audit } from "../middleware/audit";
import { authenticate } from "../middleware/auth";

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

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfaCode: z.string().optional()
});

router.post("/login", audit("LOGIN", "USER"), async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.flatten().fieldErrors });
    }
    const { email, password, mfaCode } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (user.mfaEnabled) {
      if (!user.mfaSecret) {
        return res.status(500).json({ message: "MFA misconfigured for user" });
      }
      if (!mfaCode || !authenticator.check(mfaCode, user.mfaSecret)) {
        return res.status(401).json({ message: "Invalid MFA code" });
      }
    }

    const tokens: TokenPair = signTokens(user);
    setTokenCookies(res, tokens);

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        countyId: user.countyId
      },
      tokens
    });
  } catch {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/mfa/setup", authenticate(), audit("MFA_SETUP", "USER"), async (req, res) => {
  try {
    const { userId } = req.body as { userId: string };

    if (!userId) {
      return res.status(400).json({ message: "userId required" });
    }
    if (req.user!.id !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, env.MFA_ISSUER, secret);

    await prisma.user.update({
      where: { id: user.id },
      data: { mfaSecret: secret, mfaEnabled: false }
    });

    return res.json({ otpauthUrl: otpauth });
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

router.post("/logout", audit("LOGOUT", "USER"), async (_req, res) => {
  res.clearCookie("nyayo_access_token");
  res.clearCookie("nyayo_refresh_token");
  return res.status(204).send();
});

export default router;

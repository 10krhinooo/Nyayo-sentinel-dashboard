import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { audit } from "../middleware/audit";

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

router.post("/login", audit("LOGIN", "USER"), async (req, res) => {
  const { email, password, mfaCode } = req.body as {
    email: string;
    password: string;
    mfaCode?: string;
  };

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

  res.cookie("nyayo_access_token", tokens.accessToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: env.accessTokenTtlSeconds * 1000
  });

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      countyId: user.countyId
    },
    tokens
  });
});

router.post("/mfa/setup", audit("MFA_SETUP", "USER"), async (req, res) => {
  const { userId } = req.body as { userId: string };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(user.email, env.MFA_ISSUER, secret);

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaSecret: secret, mfaEnabled: true }
  });

  return res.json({ otpauthUrl: otpauth });
});

router.post("/token/refresh", audit("TOKEN_REFRESH", "USER"), async (req, res) => {
  const { refreshToken } = req.body as { refreshToken: string };
  if (!refreshToken) {
    return res.status(400).json({ message: "Refresh token required" });
  }
  try {
    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_TOKEN_SECRET) as { id: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) {
      return res.status(401).json({ message: "Invalid token" });
    }
    const tokens = signTokens(user);
    return res.json({ tokens });
  } catch {
    return res.status(401).json({ message: "Invalid or expired refresh token" });
  }
});

router.post("/logout", audit("LOGOUT", "USER"), async (_req, res) => {
  res.clearCookie("nyayo_access_token");
  return res.status(204).send();
});

export default router;


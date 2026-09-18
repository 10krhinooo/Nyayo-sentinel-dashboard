import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthUser } from "../types/auth";

const ACCESS_TOKEN_COOKIE = "nyayo_access_token";

interface JwtPayload extends AuthUser {
  exp: number;
  iat: number;
}

function readToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return (req as Request & { cookies?: Record<string, string> }).cookies?.[
    ACCESS_TOKEN_COOKIE
  ];
}

function verify(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_TOKEN_SECRET) as JwtPayload;
    const { id, role, countyId } = decoded;
    return { id, role, countyId };
  } catch {
    return null;
  }
}

/**
 * Rejects the request with 401 unless it carries a valid access token.
 *
 * This replaces the previous `authenticate(optional = false)`. That signature
 * made the dangerous mode the shorter one to type: `authenticate(true)` let an
 * anonymous request through with `req.user` undefined, and every downstream
 * scoping check was written as `req.user?.role === COUNTY_OFFICIAL`, which is
 * false for an anonymous caller and so fell through to the national branch.
 * Six data routes were readable without a token as a result. Optional
 * authentication is now a separate, explicitly named export so it cannot be
 * selected by accident.
 */
export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = readToken(req);
    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const user = verify(token);
    if (!user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    req.user = user;
    return next();
  };
}

/**
 * Attaches `req.user` when a valid token is present and continues regardless.
 *
 * Only for endpoints that are genuinely meaningful to an anonymous caller.
 * Anything reading data must use `requireAuth()`. Any handler behind this must
 * treat `req.user` as absent by default rather than inferring privilege from
 * its absence.
 */
export function authenticateOptional() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = readToken(req);
    if (token) {
      const user = verify(token);
      if (user) req.user = user;
    }
    return next();
  };
}

export function requireRoles(roles: AuthUser["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    return next();
  };
}

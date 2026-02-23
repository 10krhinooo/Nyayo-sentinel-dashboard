import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthUser } from "../types/auth";

const ACCESS_TOKEN_COOKIE = "nyayo_access_token";

interface JwtPayload extends AuthUser {
  exp: number;
  iat: number;
}

export function authenticate(optional = false) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const cookieToken = (req as any).cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;

    const token =
      (authHeader && authHeader.startsWith("Bearer ") && authHeader.substring(7)) || cookieToken;

    if (!token) {
      if (optional) return next();
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_TOKEN_SECRET) as JwtPayload;
      const { id, role, countyId } = decoded;
      const user: AuthUser = { id, role, countyId };
      req.user = user;
      return next();
    } catch {
      if (optional) return next();
      return res.status(401).json({ message: "Invalid or expired token" });
    }
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


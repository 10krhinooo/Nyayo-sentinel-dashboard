import { Request, Response, NextFunction } from "express";
import { UserRole } from "@prisma/client";

/**
 * The county a request is confined to.
 *
 * `countyId: null` means national scope (NATIONAL_ADMIN and ANALYST).
 * A COUNTY_OFFICIAL always carries a concrete countyId; a request that cannot
 * be given one is rejected rather than widened.
 */
export interface RequestScope {
  countyId: string | null;
  national: boolean;
}

/**
 * Resolves the county scope for the authenticated user once, so handlers read
 * `req.scope` instead of re-deriving it.
 *
 * Previously each of ten handlers wrote some variant of
 *
 *     if (req.user?.role === COUNTY_OFFICIAL && req.user.countyId) { ... }
 *
 * which fails *open* twice over. An anonymous request skipped the branch and
 * got national data, and so did a county official whose countyId had been
 * nulled (PATCH /users accepts countyCode: null for any role, and only the
 * create path required one). Both now produce an error instead of a wider
 * result set.
 *
 * Must be mounted after `requireAuth()`.
 */
export function resolveScope() {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (user.role === UserRole.COUNTY_OFFICIAL) {
      if (!user.countyId) {
        return res.status(403).json({
          message: "This account has no county assigned. Contact an administrator.",
        });
      }
      req.scope = { countyId: user.countyId, national: false };
      return next();
    }

    req.scope = { countyId: null, national: true };
    return next();
  };
}

/**
 * Prisma `where` fragment restricting a query to the request's county.
 * Spread into a where object: `{ ...countyWhere(req), status: "OPEN" }`.
 */
export function countyWhere(req: Request): { countyId?: string } {
  const scope = req.scope;
  if (!scope) {
    // resolveScope() was not mounted. Fail closed rather than silently
    // returning an unscoped filter.
    throw new Error("resolveScope() middleware is missing on this route");
  }
  return scope.countyId ? { countyId: scope.countyId } : {};
}

/**
 * True when the request may read or act on the given county.
 * National scope may act on any county; a county official only on its own.
 */
export function canAccessCounty(req: Request, countyId: string | null | undefined): boolean {
  const scope = req.scope;
  if (!scope) {
    throw new Error("resolveScope() middleware is missing on this route");
  }
  if (scope.national) return true;
  return !!countyId && countyId === scope.countyId;
}

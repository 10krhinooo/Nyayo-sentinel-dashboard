import type { UserRole } from "@prisma/client";

export interface AuthUser {
  id: string;
  role: UserRole;
  countyId?: string | null;
}

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface User extends AuthUser {}

    interface Request {
      user?: AuthUser;
    }
  }
}


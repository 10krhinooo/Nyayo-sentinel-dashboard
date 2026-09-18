import type { UserRole } from "@prisma/client";

export interface AuthUser {
  id: string;
  role: UserRole;
  countyId?: string | null;
}

declare global {
  // Express type augmentation requires a namespace; module syntax cannot
  // merge into the existing Express types here.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AuthUser {}

    interface Request {
      user?: AuthUser;
      scope?: import("../middleware/scope").RequestScope;
    }
  }
}


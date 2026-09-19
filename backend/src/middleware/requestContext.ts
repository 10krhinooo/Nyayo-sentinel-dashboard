import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { withRequestContext } from "../lib/logger";

const REQUEST_ID_HEADER = "x-request-id";

/**
 * Assigns each request an id, echoes it back, and makes it available to every
 * log line emitted while handling that request.
 *
 * An inbound id is honoured so a request can be followed across services;
 * otherwise one is generated.
 */
export function requestContext() {
  return (req: Request, res: Response, next: NextFunction) => {
    const inbound = req.headers[REQUEST_ID_HEADER];
    const requestId =
      (Array.isArray(inbound) ? inbound[0] : inbound)?.slice(0, 200) || randomUUID();

    res.setHeader(REQUEST_ID_HEADER, requestId);
    (req as Request & { requestId: string }).requestId = requestId;

    withRequestContext({ requestId, userId: req.user?.id }, () => next());
  };
}

import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

/** Thrown by route code that wants to choose its own status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly expose = true
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** 404 for anything no route matched. Mount after all routers. */
export function notFound() {
  return (req: Request, res: Response) => {
    res.status(404).json({
      message: "Not found",
      requestId: (req as Request & { requestId?: string }).requestId
    });
  };
}

/**
 * Terminal error handler. Mount last, after the 404 handler.
 *
 * Route handlers previously swallowed their own errors in bare `catch {}`
 * blocks that returned a generic 500 and discarded the cause entirely, so a
 * failing query left no trace anywhere. Handlers now pass errors here, where
 * the cause is logged with the request id and the client still receives a
 * response that leaks nothing about internals.
 */
// Express identifies the error handler by its four-argument signature, so
// `next` must stay even though it is unused.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler() {
  return (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = (req as Request & { requestId?: string }).requestId;
    const status = err instanceof HttpError ? err.status : 500;

    if (status >= 500) {
      logger.error(
        { err, method: req.method, path: req.originalUrl, status },
        "Request failed"
      );
    } else {
      logger.warn(
        { method: req.method, path: req.originalUrl, status, message: (err as Error)?.message },
        "Request rejected"
      );
    }

    if (res.headersSent) return;

    const message =
      err instanceof HttpError && err.expose ? err.message : "Internal server error";

    res.status(status).json({ message, requestId });
  };
}

/**
 * Wraps an async handler so a rejected promise reaches the error handler.
 * Express 4 does not await handlers, so without this a rejection becomes an
 * unhandled rejection rather than a 500.
 */
export function asyncHandler<T extends (...args: never[]) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    void (fn as unknown as (r: Request, s: Response, n: NextFunction) => Promise<unknown>)(
      req,
      res,
      next
    ).catch(next);
  };
}

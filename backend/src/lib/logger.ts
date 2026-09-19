import { AsyncLocalStorage } from "async_hooks";
import pino from "pino";
import { env } from "../config/env";

interface RequestContext {
  requestId: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with the given request context attached to every log line. */
export function withRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export const logger = pino({
  level: env.LOG_LEVEL,
  // Pretty output is for a terminal; production emits newline-delimited JSON
  // so a log shipper can parse it.
  ...(env.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } }
    : {}),
  // Anything that can carry a credential is removed before it is written.
  // Logs outlive the request and are shipped off the host, so a token in a
  // log line is a token in a third-party system.
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      'req.headers["x-api-key"]',
      'req.headers["x-csrf-token"]',
      "res.headers['set-cookie']",
      "password",
      "passwordHash",
      "otp",
      "otpCode",
      "token",
      "accessToken",
      "refreshToken"
    ],
    censor: "[redacted]"
  },
  base: { service: "nyayo-backend" },
  // The request id is attached automatically, so call sites do not have to
  // thread it through every function signature.
  mixin() {
    const store = storage.getStore();
    return store ? { requestId: store.requestId, userId: store.userId } : {};
  }
});

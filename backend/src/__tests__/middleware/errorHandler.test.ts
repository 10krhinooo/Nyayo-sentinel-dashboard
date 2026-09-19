import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const logs = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn() };
vi.mock("../../lib/logger", () => ({
  logger: logs,
  withRequestContext: (_ctx: unknown, fn: () => unknown) => fn(),
  currentRequestId: () => undefined,
}));

const { errorHandler, notFound, HttpError, asyncHandler } = await import(
  "../../middleware/errorHandler"
);
const { requestContext } = await import("../../middleware/requestContext");

function buildApp(mount: (app: express.Express) => void) {
  const app = express();
  app.use(express.json());
  app.use(requestContext());
  mount(app);
  app.use(notFound());
  app.use(errorHandler());
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe("notFound", () => {
  it("returns 404 with the request id for an unmatched route", async () => {
    const res = await request(buildApp(() => {})).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Not found");
    expect(res.body.requestId).toBeTruthy();
  });
});

describe("errorHandler", () => {
  it("turns an unexpected throw into a 500 without leaking the message", async () => {
    const app = buildApp((a) =>
      a.get("/boom", () => {
        throw new Error("connection string user:hunter2@db");
      })
    );
    const res = await request(app).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Internal server error");
    expect(JSON.stringify(res.body)).not.toContain("hunter2");
  });

  // The whole point: bare `catch {}` blocks discarded the cause entirely.
  it("logs the cause it does not return to the client", async () => {
    const app = buildApp((a) =>
      a.get("/boom", () => {
        throw new Error("underlying failure");
      })
    );
    await request(app).get("/boom");

    expect(logs.error).toHaveBeenCalled();
    const [payload] = logs.error.mock.calls[0];
    expect((payload.err as Error).message).toBe("underlying failure");
  });

  it("honours the status and message of an HttpError", async () => {
    const app = buildApp((a) =>
      a.get("/teapot", () => {
        throw new HttpError(418, "I am a teapot");
      })
    );
    const res = await request(app).get("/teapot");

    expect(res.status).toBe(418);
    expect(res.body.message).toBe("I am a teapot");
  });

  it("hides the message of a non-exposed HttpError", async () => {
    const app = buildApp((a) =>
      a.get("/secret", () => {
        throw new HttpError(500, "internal detail", false);
      })
    );
    const res = await request(app).get("/secret");
    expect(res.body.message).toBe("Internal server error");
  });

  it("logs 4xx as a warning and 5xx as an error", async () => {
    const app = buildApp((a) => {
      a.get("/bad", () => {
        throw new HttpError(400, "bad input");
      });
      a.get("/broken", () => {
        throw new Error("boom");
      });
    });

    await request(app).get("/bad");
    expect(logs.warn).toHaveBeenCalled();
    expect(logs.error).not.toHaveBeenCalled();

    vi.clearAllMocks();
    await request(app).get("/broken");
    expect(logs.error).toHaveBeenCalled();
  });

  it("includes the request id in the error response", async () => {
    const app = buildApp((a) =>
      a.get("/boom", () => {
        throw new Error("x");
      })
    );
    const res = await request(app).get("/boom");
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  });
});

describe("asyncHandler", () => {
  // Express 4 does not await handlers, so a rejected promise would otherwise
  // become an unhandled rejection rather than a 500.
  it("routes a rejected promise to the error handler", async () => {
    const app = buildApp((a) =>
      a.get(
        "/async",
        asyncHandler(async () => {
          throw new Error("async failure");
        })
      )
    );
    const res = await request(app).get("/async");

    expect(res.status).toBe(500);
    expect(logs.error).toHaveBeenCalled();
  });

  it("leaves a successful handler alone", async () => {
    const app = buildApp((a) =>
      a.get(
        "/ok",
        asyncHandler(async (_req: never, res: never) => {
          (res as unknown as express.Response).json({ ok: true });
        })
      )
    );
    const res = await request(app).get("/ok");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe("requestContext", () => {
  it("generates a request id and echoes it in the response header", async () => {
    const app = buildApp((a) => a.get("/x", (_req, res) => res.json({})));
    const res = await request(app).get("/x");
    expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  // Lets a request be followed across service boundaries.
  it("honours an inbound request id", async () => {
    const app = buildApp((a) => a.get("/x", (_req, res) => res.json({})));
    const res = await request(app).get("/x").set("x-request-id", "upstream-123");
    expect(res.headers["x-request-id"]).toBe("upstream-123");
  });

  it("truncates an absurdly long inbound id rather than echoing it whole", async () => {
    const app = buildApp((a) => a.get("/x", (_req, res) => res.json({})));
    const res = await request(app).get("/x").set("x-request-id", "a".repeat(5000));
    expect(res.headers["x-request-id"].length).toBeLessThanOrEqual(200);
  });
});

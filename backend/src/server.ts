import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";
import { doubleCsrf } from "csrf-csrf";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { AuthUser } from "./types/auth";
import authRoutes from "./routes/auth";
import dashboardRoutes from "./routes/dashboard";
import countiesRoutes from "./routes/counties";
import topicsRoutes from "./routes/topics";
import alertsRoutes, { evaluateAlertThresholds } from "./routes/alerts";
import reportsRoutes from "./routes/reports";
import usersRoutes from "./routes/users";
import profileRoutes from "./routes/profile";
import ingestRoutes from "./routes/ingest";
import eventsRoutes from "./routes/events";
import healthRoutes from "./routes/health";
import { logger } from "./lib/logger";
import { requestContext } from "./middleware/requestContext";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { httpLogger } from "./middleware/httpLogger";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.allowedOrigins,
    credentials: true
  })
);
app.use(requestContext());
app.use(httpLogger());
app.use(express.json());
app.use(cookieParser());

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => env.CSRF_SECRET,
  // Use cookie user ID as session identifier, fall back to IP for unauthenticated
  getSessionIdentifier: (req) => {
    try {
      const token = (req.cookies as Record<string, string>)?.nyayo_access_token;
      if (token) {
        const decoded = jwt.decode(token) as { id?: string } | null;
        if (decoded?.id) return decoded.id;
      }
    } catch { /* ignore */ }
    return req.ip ?? "anon";
  },
  cookieName: "nyayo_csrf",
  cookieOptions: {
    sameSite: "strict",
    secure: env.NODE_ENV === "production",
    httpOnly: true,
    path: "/"
  },
  size: 64,
  getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"] as string,
  // Skip CSRF for auth (pre-login) and ingest (API key auth, no cookies)
  skipCsrfProtection: (req) =>
    req.path.startsWith("/api/auth") || req.path.startsWith("/api/ingest")
});

app.use(doubleCsrfProtection);

app.use("/health", healthRoutes);

// Returns a fresh CSRF token; frontend calls this once after login
app.get("/api/csrf-token", (req, res) => {
  res.json({ token: generateCsrfToken(req, res) });
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again later." }
});

// OTP verification is the weakest point in the auth flow: a 6-digit code with
// a 10-minute lifetime is exhaustible in seconds at an unbounded request rate.
// Previously only /api/auth/login carried a limiter, so /verify-otp and
// /token/refresh were unlimited.
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many verification attempts. Please request a new code." }
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." }
});

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth/verify-otp", otpLimiter);
app.use("/api/auth/forgot-password", otpLimiter);
app.use("/api/auth/reset-password", otpLimiter);
app.use("/api/auth/set-password", otpLimiter);
// Blanket limiter for the rest of the auth surface, including /token/refresh
// and /logout, which previously had none.
app.use("/api/auth", apiLimiter, authRoutes);
app.use("/api/dashboard", apiLimiter, dashboardRoutes);
app.use("/api/counties", apiLimiter, countiesRoutes);
app.use("/api/topics", apiLimiter, topicsRoutes);
app.use("/api/alerts", apiLimiter, alertsRoutes);
app.use("/api/reports", apiLimiter, reportsRoutes);
app.use("/api/users", apiLimiter, usersRoutes);
app.use("/api/profile", apiLimiter, profileRoutes);
app.use("/api/ingest", ingestRoutes);
app.use("/api/events", apiLimiter, eventsRoutes);

// Must come after every route: 404 first, then the terminal error handler.
app.use(notFound());
app.use(errorHandler());

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: env.allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Authenticate socket connections via JWT
io.use((socket, next) => {
  try {
    let token: string | undefined;

    // Try auth.token first (explicit handshake), then cookie
    if (socket.handshake.auth?.token) {
      token = String(socket.handshake.auth.token);
    } else {
      const cookieHeader = socket.handshake.headers.cookie ?? "";
      const match = cookieHeader.match(/(?:^|;\s*)nyayo_access_token=([^;]+)/);
      if (match) token = decodeURIComponent(match[1]);
    }

    if (!token) {
      return next(new Error("Unauthorized"));
    }

    const decoded = jwt.verify(token, env.JWT_ACCESS_TOKEN_SECRET) as AuthUser & { exp: number; iat: number };
    socket.data.user = { id: decoded.id, role: decoded.role, countyId: decoded.countyId };
    return next();
  } catch {
    return next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  logger.debug({ socketId: socket.id, role: socket.data.user?.role }, "WebSocket client connected");
});

// Alert evaluation runs on every replica, so without coordination each one
// creates the same alerts and sends the same emails. A session-level advisory
// lock makes exactly one replica per tick do the work. This is the interim
// guard; a proper job queue replaces the bare interval later.
const ALERT_EVAL_LOCK = 8471023;

async function runAlertEvaluation() {
  const [{ locked }] = await prisma.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(${ALERT_EVAL_LOCK}) AS locked`;

  if (!locked) return;

  try {
    await evaluateAlertThresholds(io);
  } catch (err) {
    logger.error({ err }, "Alert evaluation failed");
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${ALERT_EVAL_LOCK})`;
  }
}

const alertInterval = setInterval(() => {
  void runAlertEvaluation();
}, 5 * 60 * 1000);

server.listen(env.port, () => {
  logger.info({ port: env.port, env: env.NODE_ENV }, "Backend listening");
});

/**
 * Stop accepting new work, let in-flight requests finish, then release
 * resources. Without this the process died immediately on SIGTERM, cutting
 * off requests mid-flight on every deploy.
 */
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");

  const forceExit = setTimeout(() => {
    logger.error("Shutdown timed out, exiting forcefully");
    process.exit(1);
  }, env.shutdownTimeoutMs);
  forceExit.unref();

  clearInterval(alertInterval);

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await io.close();
  await prisma.$disconnect();

  logger.info("Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception, shutting down");
  void shutdown("uncaughtException");
});

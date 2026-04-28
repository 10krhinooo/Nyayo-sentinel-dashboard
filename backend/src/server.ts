import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { Server as SocketIOServer } from "socket.io";
import jwt from "jsonwebtoken";
import { doubleCsrf } from "csrf-csrf";
import { env } from "./config/env";
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

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.allowedOrigins,
    credentials: true
  })
);
app.use(morgan("combined"));
app.use(express.json());
app.use(cookieParser());

const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => env.JWT_ACCESS_TOKEN_SECRET,
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

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

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

app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/counties", countiesRoutes);
app.use("/api/topics", topicsRoutes);
app.use("/api/alerts", alertsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/ingest", ingestRoutes);

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
  // eslint-disable-next-line no-console
  console.log("WebSocket client connected", socket.id, "role:", socket.data.user?.role);
});

setInterval(() => {
  void evaluateAlertThresholds(io);
}, 5 * 60 * 1000);

server.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on port ${env.port}`);
});

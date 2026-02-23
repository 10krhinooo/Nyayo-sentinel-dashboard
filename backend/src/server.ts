import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { Server as SocketIOServer } from "socket.io";
import { env } from "./config/env";
import authRoutes from "./routes/auth";
import dashboardRoutes from "./routes/dashboard";
import countiesRoutes from "./routes/counties";
import topicsRoutes from "./routes/topics";
import alertsRoutes, { evaluateAlertThresholds } from "./routes/alerts";
import reportsRoutes from "./routes/reports";

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

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/counties", countiesRoutes);
app.use("/api/topics", topicsRoutes);
app.use("/api/alerts", alertsRoutes);
app.use("/api/reports", reportsRoutes);

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: env.allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.on("connection", (socket) => {
  // eslint-disable-next-line no-console
  console.log("WebSocket client connected", socket.id);
});

// Periodic alert evaluation (e.g., every 5 minutes)
setInterval(() => {
  void evaluateAlertThresholds(io);
}, 5 * 60 * 1000);

server.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on port ${env.port}`);
});


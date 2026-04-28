import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("4000"),
  DATABASE_URL: z.string().url(),

  JWT_ACCESS_TOKEN_SECRET: z.string(),
  JWT_REFRESH_TOKEN_SECRET: z.string(),
  JWT_ACCESS_TOKEN_TTL: z.string().default("900"),
  JWT_REFRESH_TOKEN_TTL: z.string().default("604800"),

  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  MFA_ISSUER: z.string().default("NyayoSentinel"),

  NOTIFY_EMAIL_FROM: z.string().optional(),
  NOTIFY_SMS_SENDER: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  FRONTEND_URL: z.string().url().default("http://localhost:3000")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Environment validation failed", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = {
  ...parsed.data,
  port: Number(parsed.data.PORT),
  accessTokenTtlSeconds: Number(parsed.data.JWT_ACCESS_TOKEN_TTL),
  refreshTokenTtlSeconds: Number(parsed.data.JWT_REFRESH_TOKEN_TTL),
  allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
};


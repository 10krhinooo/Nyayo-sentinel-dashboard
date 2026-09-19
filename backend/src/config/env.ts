import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.string().default("4000"),
  DATABASE_URL: z.string().url(),

  // A short secret is brute-forceable offline from any issued token.
  // SCRAPER_API_KEY was already held to this standard; the signing keys were
  // bare strings, so a three character secret booted without complaint.
  JWT_ACCESS_TOKEN_SECRET: z.string().min(32, "must be at least 32 characters"),
  JWT_REFRESH_TOKEN_SECRET: z.string().min(32, "must be at least 32 characters"),
  // Distinct from the signing keys: reusing one secret across two primitives
  // means a weakness in either compromises both.
  CSRF_SECRET: z.string().min(32, "must be at least 32 characters"),
  JWT_ACCESS_TOKEN_TTL: z.string().default("900"),
  JWT_REFRESH_TOKEN_TTL: z.string().default("604800"),

  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  MFA_ISSUER: z.string().default("NyayoSentinel"),

  NOTIFY_EMAIL_FROM: z.string().optional(),
  NOTIFY_SMS_SENDER: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),

  SCRAPER_API_KEY: z.string().min(32).optional(),
  INGEST_RATE_LIMIT_RPM: z.string().default("10"),
  OPENAI_API_KEY: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Environment validation failed", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

const distinctSecrets = new Set([
  parsed.data.JWT_ACCESS_TOKEN_SECRET,
  parsed.data.JWT_REFRESH_TOKEN_SECRET,
  parsed.data.CSRF_SECRET
]);
if (distinctSecrets.size < 3) {
  throw new Error(
    "JWT_ACCESS_TOKEN_SECRET, JWT_REFRESH_TOKEN_SECRET and CSRF_SECRET must all differ"
  );
}

export const env = {
  ...parsed.data,
  port: Number(parsed.data.PORT),
  accessTokenTtlSeconds: Number(parsed.data.JWT_ACCESS_TOKEN_TTL),
  refreshTokenTtlSeconds: Number(parsed.data.JWT_REFRESH_TOKEN_TTL),
  allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
};


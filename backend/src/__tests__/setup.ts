// Set required env vars before any module can import env.ts and run Zod validation
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_nyayo";
process.env.JWT_ACCESS_TOKEN_SECRET = "test-access-secret-at-least-32-chars";
process.env.JWT_REFRESH_TOKEN_SECRET = "test-refresh-secret-at-least-32-chars";
process.env.NODE_ENV = "test";
process.env.SCRAPER_API_KEY = "test-scraper-api-key-32-chars-xxx";

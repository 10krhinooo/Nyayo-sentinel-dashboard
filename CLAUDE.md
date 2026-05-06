# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Frontend (`frontend/`)
```bash
npm run dev      # Next.js dev server on port 3000
npm run build    # Production build
npm run lint     # ESLint
./node_modules/.bin/tsc --noEmit   # TypeScript check (npx tsc installs wrong package)
```

### Backend (`backend/`)
```bash
npm run dev               # ts-node-dev with hot reload on port 4000
npm run build             # Compile TypeScript to dist/
npx tsc --noEmit          # TypeScript check
npm run prisma:generate   # Regenerate Prisma client after schema changes
npm run prisma:migrate    # Apply pending database migrations (deploy mode)
npx prisma migrate dev --name <name>  # Create + apply a new migration (dev mode)
npm run prisma:seed       # Load sample data (47 counties, 12 topics, 7 users, ~12k events)
```

### Scraper (`scraper/`)
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install torch==2.3.1+cpu --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
python main.py            # runs immediately, then every SCRAPE_INTERVAL_MINUTES
```

### Full Stack (Docker)
```bash
docker-compose up -d      # Start PostgreSQL + Backend + Frontend + Scraper
docker-compose down       # Stop all services
docker-compose logs -f    # Stream logs
```

### Environment
**`backend/.env`** (required — not committed):
```
DATABASE_URL=postgres://nyayo:nyayo_secure_password@localhost:5432/nyayo_sentinel
NODE_ENV=development
PORT=4000
JWT_ACCESS_TOKEN_SECRET=<secret>
JWT_REFRESH_TOKEN_SECRET=<secret>
JWT_ACCESS_TOKEN_TTL=900
JWT_REFRESH_TOKEN_TTL=604800
ALLOWED_ORIGINS=http://localhost:3000
MFA_ISSUER=NyayoSentinel
SMTP_USER=nyayo.sentinel@gmail.com
SMTP_PASS=<gmail-app-password>
FRONTEND_URL=http://localhost:3000
SCRAPER_API_KEY=<min-32-char-random-string>
INGEST_RATE_LIMIT_RPM=10
ANTHROPIC_API_KEY=<sk-ant-...>   # optional — enables AI-generated alert summaries
```

**`scraper/.env`** (not committed — copy from `scraper/.env.example`):
```
SCRAPER_API_KEY=<same value as backend>
INGEST_URL=http://localhost:4000/api/ingest/events
SCRAPE_INTERVAL_MINUTES=60
DEDUP_DB_PATH=scraper_dedup.db
```

**`frontend/.env.local`**:
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

No test suite is configured yet.

---

## Architecture

```
Browser → Next.js Frontend (3000) → Express Backend (4000) → PostgreSQL (5432)
                                           ↕ Socket.io (real-time alerts)
                                           ↕ Gmail SMTP (transactional email)
```

---

## Frontend (`frontend/src/`)

### Route structure (Next.js App Router groups)
```
app/
  layout.tsx                    # Root: html/body + Inter font only
  globals.css                   # Full design system (tokens, sidebar, login, cards, etc.)
  (auth)/
    layout.tsx                  # Pass-through (no sidebar)
    login/page.tsx              # Step 1: email+password → Step 2: email OTP
    set-password/page.tsx       # Invite token → set password (first login)
    forgot-password/page.tsx    # Request password reset email
    reset-password/page.tsx     # Token from email → set new password
  (dashboard)/
    layout.tsx                  # AuthGuard + Sidebar + Topbar wrapper
    page.tsx                    # National sentiment overview
    heatmap/page.tsx            # Kenya county + sub-county heatmap
    topics/page.tsx             # Topic sentiment breakdown
    alerts/page.tsx             # Real-time alerts table with pagination + status actions
    reports/page.tsx            # CSV downloads (axios blob, not plain <a href>)
    admin/page.tsx              # User management (invite flow) + threshold config
    profile/page.tsx            # Edit name, change password, view 2FA status
```

### Key lib files
- **`lib/api.ts`** — Axios instance (`withCredentials: true`) + 401 interceptor that transparently refreshes the access token and retries. Import `api` for all HTTP calls.
- **`lib/auth.ts`** — `getUser()` / `setUser()` / `clearUser()` backed by localStorage key `nyayo_user`. Server-side safe (guards on `typeof window`). AuthUser includes `firstName?`, `lastName?`.
- **`lib/socket.ts`** — Lazy Socket.io singleton. Passes `nyayo_access_token` cookie on handshake. Call `disconnectSocket()` on logout.

### Key components
- **`AuthGuard`** — Client component. On mount: redirects to `/login` if `getUser()` is null. All dashboard pages are wrapped in this via `(dashboard)/layout.tsx`.
- **`Sidebar`** — Role-aware nav (links filtered by role), user avatar + email + role pill at bottom, logout button. Includes Profile link for all roles.
- **`Topbar`** — Shows current page title (mapped from pathname) + open alert count badge.
- **`KenyaHeatmap`** — `react-simple-maps` county map using `/public/geo/kenya-counties.geojson`. Matches on `geo.properties.COUNTY_NAM`.
- **`SubCountyHeatmap`** — Drill-down map for sub-county level using `/public/geo/kenya-subcounties.geojson`.

---

## Backend (`backend/src/`)

- **`server.ts`** — Express app, Socket.io (with JWT handshake auth), rate limiter on `/api/auth/login`, 5-minute alert evaluation loop. Registers `/api/profile` and `/api/ingest` routes.
- **`routes/auth.ts`** — Login (password verify → email OTP for mfaEnabled users, direct login for mfaEnabled=false), `POST /verify-otp`, `POST /set-password` (invite), `POST /forgot-password`, `POST /reset-password`, token refresh, logout.
- **`routes/users.ts`** — Admin-only. `POST /users` generates invite token + sends invite email (no password set by admin). Accepts `countyCode` (e.g. `"047"`) and resolves to countyId. `PATCH` and `DELETE` unchanged.
- **`routes/profile.ts`** — `GET /profile`, `PATCH /profile` (firstName/lastName), `POST /profile/change-password`. All require `authenticate()`.
- **`routes/alerts.ts`** — GET with pagination, POST threshold, PATCH status, `evaluateAlertThresholds()` (emails county officials + national admins on new alert). `notifyAlertRecipients()` fetches recent article headlines from DB, calls `generateAlertSummary()`, persists the result as `alert.llmSummary`, and passes it to the email. `GET /:id/details` includes `llmSummary` in its response.
- **`routes/ingest.ts`** — `POST /api/ingest/events`: batch ingest endpoint for the scraper. Uses `requireApiKey` (not JWT). Accepts up to 500 events per request, resolves county/topic names to IDs, bulk-inserts `SentimentEvent` rows. Accepts optional `headline` (max 220 chars) and `snippet` (max 500 chars) per event for LLM context. Rate-limited at 10 req/min separately from the login limiter.
- **`services/email.ts`** — Nodemailer Gmail SMTP transporter. Functions: `sendInviteEmail`, `sendOtpEmail`, `sendAlertEmail`, `sendPasswordChangedEmail`, `sendPasswordResetEmail`, `sendWelcomeEmail`. `sendAlertEmail` accepts an optional `llmSummary` string and renders an "AI Analysis" block in the email when present. Logs a warning and skips silently if SMTP_USER/SMTP_PASS are not set.
- **`services/llm.ts`** — Lazy Anthropic client. `generateAlertSummary()` calls Claude Haiku with the county, topic, trigger type, stats, and up to 15 recent article headlines to produce a 2–3 sentence plain-English summary. Returns `null` if `ANTHROPIC_API_KEY` is not set or no headlines are available — callers degrade gracefully.
- **`middleware/auth.ts`** — `authenticate(optional?)`: reads JWT from `Authorization: Bearer` header or `nyayo_access_token` cookie. `requireRoles(roles[])`: RBAC check.
- **`middleware/apiKey.ts`** — `requireApiKey`: reads `X-API-Key` header, compares to `env.SCRAPER_API_KEY` using `crypto.timingSafeEqual`. Returns 503 if key not configured, 401 if wrong.
- **`middleware/audit.ts`** — Logs to `AuditLog` only on 2xx responses. Captures `resourceId` from `req.params.id`.
- **`config/env.ts`** — Zod-parsed env. Always import `env` from here — never use `process.env` directly in routes. Exports `SMTP_USER`, `SMTP_PASS`, `FRONTEND_URL`, `SCRAPER_API_KEY`, `INGEST_RATE_LIMIT_RPM`, `ANTHROPIC_API_KEY`.

### Auth flow (2FA)
- `POST /auth/login`: verify password → if `mustSetPassword`, return `requiresPasswordSetup: true` → if `mfaEnabled: false` (seed users), issue tokens directly → if `mfaEnabled: true` (new users), generate bcrypt-hashed OTP, store with 10-min expiry, email user, return `requiresOtp: true`.
- `POST /auth/verify-otp`: check OTP hash + expiry → clear OTP fields, update `lastLoginAt`, issue token pair.
- Seed users have `mfaEnabled: false` — they skip OTP. New invited users have `mfaEnabled: true` — OTP is always required.

### User invite flow
1. Admin posts `POST /users` with email, role, countyCode (no password).
2. Backend generates a UUID `inviteToken` (24-hour expiry), stores it on User, sends invite email.
3. User clicks link → `/set-password?token=<uuid>`.
4. `POST /auth/set-password` validates token + expiry, hashes password, clears invite fields, sets `mustSetPassword: false`, sends welcome email.

### Alert evaluation
`evaluateAlertThresholds()` in `routes/alerts.ts`:
1. Fetches all active thresholds.
2. Fetches distinct county IDs from the last 24 hours **once** (not per threshold).
3. For each threshold × county: runs aggregate COUNT queries, checks against threshold, deduplicates on `OPEN|ACKNOWLEDGED` status, creates `Alert`, emits `alert:new` via Socket.io, calls `notifyAlertRecipients()` async.
4. `notifyAlertRecipients()`: fetches recent `SentimentEvent` headlines for the alert's county+topic window, calls `generateAlertSummary()` (Claude Haiku), persists result as `alert.llmSummary`, then emails county officials + national admins with the LLM summary included.

Socket emit is county-scoped: sockets where `socket.data.user.countyId === alert.countyId` or `countyId === null` (national admins/analysts) receive it.

### Scraper service (`scraper/`)

- **`main.py`** — Scheduler loop. Calls each scraper, runs NLP pipeline per article, builds event dicts (including `headline` and `snippet` for LLM context), calls `post_events()`. Runs immediately on start, then every `SCRAPE_INTERVAL_MINUTES`.
- **`config.py`** — Reads `.env`, defines `COUNTY_NAMES` (47) and `TOPIC_NAMES` (12) as Python lists. These must stay in sync with `prisma/seed.ts`.
- **`dedup.py`** — SQLite-backed URL deduplication. `is_seen(url)` / `mark_seen(url)` / `purge_old(days=30)`. DB path from `DEDUP_DB_PATH` env var.
- **`ingest_client.py`** — POSTs event batches to `INGEST_URL` with `X-API-Key` header. Chunks at 500 events. Logs full response body on error.
- **`nlp/sentiment.py`** — Lazy-loaded `cardiffnlp/twitter-roberta-base-sentiment-latest` pipeline. `analyze(text)` returns `{label, score}` where score = `positive_prob - negative_prob` ∈ [-1, 1].
- **`nlp/county_detector.py`** — Regex word-boundary matching against 47 county names + aliases. Returns first matched canonical name or `None`.
- **`nlp/topic_detector.py`** — Keyword matching for 12 topics. Returns a list — one article can match multiple topics, producing one `SentimentEvent` per `(county, topic)` pair.
- **`scrapers/rss_feeds.py`** — feedparser + requests/BeautifulSoup for Nation Africa, Standard Media, Citizen TV, KBC RSS feeds.
- **`scrapers/reddit_kenya.py`** — Reddit public JSON API (`/r/Kenya/new.json`). No credentials required.
- **`scrapers/facebook_pages.py`** — Scrapes 7 major Kenyan Facebook pages (Nation, Standard, Citizen, KBC, Tuko, The Star, Kenya Red Cross) via the `facebook-scraper` library. Accepts optional `FACEBOOK_COOKIES` (Netscape-format file) to reduce interstitials; falls back to RSS/homepage scraping when cookies are absent or the library fails.
- **`scrapers/instagram_pages.py`** — Fetches posts from `nairobi_gossip_club` via `instaloader`. Login is optional: if `INSTAGRAM_USERNAME`/`INSTAGRAM_PASSWORD` are set it attempts authenticated access; if credentials are missing or Instagram returns a checkpoint/login error it falls back to unauthenticated fetching of the public profile. Controlled by `INSTAGRAM_ENABLED` flag.
- **`train/finetune.py`** — Phase 2 script. Run manually after collecting ~1,500 human-labeled articles. Fine-tunes `Davlan/afro-xlmr-large` (English + Swahili).

Timestamps sent to the backend must use `strftime("%Y-%m-%dT%H:%M:%SZ")` format — Zod's `.datetime()` requires `Z` suffix, not `+00:00`.

### Data model invariants
- `SentimentEvent` must never store PII (no names, IDs, phone numbers). The `headline` and `snippet` fields store public article content sourced from published news — this is acceptable. Never store user-generated free text that could identify individuals.
- `Alert.llmSummary` is populated asynchronously after alert creation by `notifyAlertRecipients()`; it may be `null` for alerts fired before the LLM feature was deployed or when `ANTHROPIC_API_KEY` is not set.
- `COUNTY_OFFICIAL` users are always scoped at the API layer via `req.user.countyId` — enforce this in every new route that touches county data.
- Audit logs are append-only by convention — never delete or update `AuditLog` rows.
- OTP codes are bcrypt-hashed before storage — never store plaintext codes.

### Performance indexes (already migrated)
`SentimentEvent(timestamp)`, `SentimentEvent(countyId)`, `SentimentEvent(topicId)`, `SentimentEvent(constituencyId)`, `SentimentEvent(subCountyId)`, `Alert(status)`, `Alert(countyId)`.

---

## Seed data

Run `npm run prisma:seed` inside `backend/`. Creates:
- 47 counties (all official Kenya counties, codes 001–047)
- 12 topics (Corruption, Healthcare, Land & Housing, Youth Unemployment, etc.)
- 7 users (see README for credentials — all use password `Nyayo2024!`, `mfaEnabled: false`)
- ~12,000 sentiment events over 30 days with realistic county/topic bias
- 6 alert thresholds + 8 sample alerts

The seed uses `upsert` for counties/topics/users so it is safe to re-run.

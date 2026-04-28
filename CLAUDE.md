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

### Full Stack (Docker)
```bash
docker-compose up -d      # Start PostgreSQL (5432) + Backend (4000) + Frontend (3000)
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

- **`server.ts`** — Express app, Socket.io (with JWT handshake auth), rate limiter on `/api/auth/login`, 5-minute alert evaluation loop. Registers `/api/profile` route.
- **`routes/auth.ts`** — Login (password verify → email OTP for mfaEnabled users, direct login for mfaEnabled=false), `POST /verify-otp`, `POST /set-password` (invite), `POST /forgot-password`, `POST /reset-password`, token refresh, logout.
- **`routes/users.ts`** — Admin-only. `POST /users` generates invite token + sends invite email (no password set by admin). Accepts `countyCode` (e.g. `"047"`) and resolves to countyId. `PATCH` and `DELETE` unchanged.
- **`routes/profile.ts`** — `GET /profile`, `PATCH /profile` (firstName/lastName), `POST /profile/change-password`. All require `authenticate()`.
- **`routes/alerts.ts`** — GET with pagination, POST threshold, PATCH status, `evaluateAlertThresholds()` (emails county officials + national admins on new alert).
- **`services/email.ts`** — Nodemailer Gmail SMTP transporter. Functions: `sendInviteEmail`, `sendOtpEmail`, `sendAlertEmail`, `sendPasswordChangedEmail`, `sendPasswordResetEmail`, `sendWelcomeEmail`. Logs a warning and skips silently if SMTP_USER/SMTP_PASS are not set.
- **`middleware/auth.ts`** — `authenticate(optional?)`: reads JWT from `Authorization: Bearer` header or `nyayo_access_token` cookie. `requireRoles(roles[])`: RBAC check.
- **`middleware/audit.ts`** — Logs to `AuditLog` only on 2xx responses. Captures `resourceId` from `req.params.id`.
- **`config/env.ts`** — Zod-parsed env. Always import `env` from here — never use `process.env` directly in routes. Exports `SMTP_USER`, `SMTP_PASS`, `FRONTEND_URL`.

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
3. For each threshold × county: runs aggregate COUNT queries, checks against threshold, deduplicates on `OPEN|ACKNOWLEDGED` status, creates `Alert`, emits `alert:new` via Socket.io, emails county officials + national admins.

Socket emit is county-scoped: sockets where `socket.data.user.countyId === alert.countyId` or `countyId === null` (national admins/analysts) receive it.

### Data model invariants
- `SentimentEvent` must never store PII (no names, IDs, phone numbers, free text).
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

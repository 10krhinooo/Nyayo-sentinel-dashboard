Nyayo Sentinel Dashboard – Early Warning System
================================================

A secure, production-ready government analytics platform for monitoring public sentiment across all 47 Kenyan counties. Designed as an **early warning system** for detecting emerging frustration, unrest, or spikes in negative sentiment, with county- and topic-level drill-downs, real-time alerting, email notifications, and full audit logging.

---

## Architecture

```
Browser → Next.js Frontend (3000) → Express Backend (4000) → PostgreSQL (5432)
                                           ↕ Socket.io (real-time alerts)
                                           ↕ Gmail SMTP (email notifications)
```

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Recharts, React Simple Maps |
| Backend | Node.js 20, Express 4, TypeScript, Prisma 5, Socket.io 4, Nodemailer |
| Database | PostgreSQL 16 |
| Auth | JWT (access 15 min / refresh 7 days, httpOnly cookies), Email OTP 2FA |
| Email | Gmail SMTP via Nodemailer (invite, 2FA OTP, alerts, password reset) |
| Deployment | Docker + Docker Compose |

---

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)

### 1. Configure environment

Create `backend/.env`:
```env
DATABASE_URL=postgres://nyayo:nyayo_secure_password@localhost:5432/nyayo_sentinel
NODE_ENV=development
PORT=4000
JWT_ACCESS_TOKEN_SECRET=change-me-in-production
JWT_REFRESH_TOKEN_SECRET=change-me-in-production
JWT_ACCESS_TOKEN_TTL=900
JWT_REFRESH_TOKEN_TTL=604800
ALLOWED_ORIGINS=http://localhost:3000
MFA_ISSUER=NyayoSentinel
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-gmail-app-password
FRONTEND_URL=http://localhost:3000
```

> **Gmail App Password**: In your Google account go to Security → 2-Step Verification → App passwords. Use the 16-character password generated there as `SMTP_PASS`. Do **not** use your normal Gmail password.

Create `frontend/.env.local`:
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

### 2. Start the database
```bash
docker-compose up -d postgres
```

### 3. Run migrations and seed sample data
```bash
cd backend
npm install
npm run prisma:migrate   # apply schema migrations
npm run prisma:seed      # load 47 counties, 12 topics, 7 users, ~12,000 events
```

### 4. Start the services
```bash
# Terminal 1 – backend
cd backend && npm run dev

# Terminal 2 – frontend
cd frontend && npm install && npm run dev
```

Open **http://localhost:3000** → redirects to the login page.

### Full Docker stack (production-like)
```bash
docker-compose up -d     # builds and starts all three services
docker-compose down      # tear down
docker-compose logs -f   # stream logs
```

---

## Seed Credentials

All seed accounts use password **`Nyayo2024!`** and log in **without** email OTP (2FA is only enforced on new accounts created via the invite flow).

| Email | Role | Scope |
|-------|------|-------|
| `admin@sentinel.ke` | National Admin | All 47 counties |
| `analyst@sentinel.ke` | Analyst | All counties (read-only) |
| `analyst2@sentinel.ke` | Analyst | All counties (read-only) |
| `nairobi.official@county.ke` | County Official | Nairobi only |
| `mombasa.official@county.ke` | County Official | Mombasa only |
| `kisumu.official@county.ke` | County Official | Kisumu only |
| `nakuru.official@county.ke` | County Official | Nakuru only |

---

## Features

### Authentication & Access Control
- **Email OTP 2FA** — new accounts (created via invite) require a 6-digit code sent to their email on every login; seed accounts bypass OTP
- **User invite flow** — admin creates a user (no password required); a 24-hour invite link is emailed; user sets their own password on first access
- **Forgot / reset password** — self-service reset via emailed token link (1-hour expiry)
- Role-based navigation — sidebar links are scoped per role:
  - **National Admin**: Dashboard, Heatmap, Topics, Alerts, Reports, Admin, Profile
  - **Analyst**: Dashboard, Heatmap, Topics, Alerts, Reports, Profile
  - **County Official**: Dashboard, Heatmap, Topics, Alerts (county-scoped), Profile
- HTTP-only cookie tokens with transparent refresh on 401
- Audit log on every sensitive action (2xx only, KDPA-compliant)

### Profile
- View name, email, role, county, last login, and 2FA status
- Edit first and last name
- Change password (requires current password, sends confirmation email)

### Sentiment Overview Dashboard
- National sentiment distribution (positive / neutral / negative %)
- Rolling average sentiment score
- 7-day trend chart
- Top 5 emerging negative topics

### County Heatmap
- Interactive Kenya map — counties shaded by negative sentiment intensity
- Drill down to sub-county and constituency level
- Hover tooltip: score, negative share, event volume
- Sortable county data table

### Topic Analysis
- Stacked bar chart of sentiment distribution per topic
- Per-topic count breakdown table

### Early Warning Alerts
- Real-time alerts pushed over Socket.io (scoped to user's county)
- **Email notification** — county officials and national admins are emailed whenever a new alert fires
- Acknowledge and Resolve buttons with optimistic UI updates
- Pagination (20 per page)
- Two trigger types: `THRESHOLD` (negative %) and `SPIKE` (volume factor)

### Reports
- Authenticated CSV download: Weekly Summary, County Comparison
- Downloads sent via axios blob (auth cookies included)

### Admin Panel *(National Admin only)*
- Create users via invite email — no password set by admin
- County code lookup (e.g. `047` for Nairobi) instead of raw database IDs
- View and create alert thresholds (metric type, severity, county, topic)
- User table shows "Invite pending" badge until the user activates their account

---

## Email Notifications

The system sends email in the following situations:

| Trigger | Recipient | Template |
|---------|-----------|----------|
| Admin creates a new user | New user | Invite link (24 hr expiry) |
| Login for a 2FA-enabled account | Logging-in user | 6-digit OTP (10 min expiry) |
| Alert threshold triggered | County official + all national admins | Alert detail with severity and summary |
| User changes their password | Account owner | Password changed confirmation |
| User requests password reset | Account owner | Reset link (1 hr expiry) |
| User sets password via invite | Account owner | Welcome / account activated |

---

## County Codes

County Officials must be assigned using the 3-digit county code (e.g. `047` for Nairobi). Full list:

| Code | County | Code | County |
|------|--------|------|--------|
| 001 | Mombasa | 025 | Samburu |
| 002 | Kwale | 026 | Trans-Nzoia |
| 003 | Kilifi | 027 | Uasin Gishu |
| 004 | Tana River | 028 | Elgeyo-Marakwet |
| 005 | Lamu | 029 | Nandi |
| 006 | Taita-Taveta | 030 | Baringo |
| 007 | Garissa | 031 | Laikipia |
| 008 | Wajir | 032 | Nakuru |
| 009 | Mandera | 033 | Narok |
| 010 | Marsabit | 034 | Kajiado |
| 011 | Isiolo | 035 | Kericho |
| 012 | Meru | 036 | Bomet |
| 013 | Tharaka-Nithi | 037 | Kakamega |
| 014 | Embu | 038 | Vihiga |
| 015 | Kitui | 039 | Bungoma |
| 016 | Machakos | 040 | Busia |
| 017 | Makueni | 041 | Siaya |
| 018 | Nyandarua | 042 | Kisumu |
| 019 | Nyeri | 043 | Homa Bay |
| 020 | Kirinyaga | 044 | Migori |
| 021 | Murang'a | 045 | Kisii |
| 022 | Kiambu | 046 | Nyamira |
| 023 | Turkana | 047 | Nairobi |
| 024 | West Pokot | | |

---

## Project Structure

```
nyayo-sentinel-dashboard/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx          # Email + password → OTP step
│   │   │   │   ├── set-password/page.tsx   # Invite token → set password
│   │   │   │   ├── forgot-password/page.tsx
│   │   │   │   └── reset-password/page.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx              # AuthGuard + Sidebar + Topbar
│   │   │   │   ├── page.tsx                # National overview
│   │   │   │   ├── heatmap/page.tsx        # County / sub-county heatmap
│   │   │   │   ├── topics/page.tsx
│   │   │   │   ├── alerts/page.tsx
│   │   │   │   ├── reports/page.tsx
│   │   │   │   ├── admin/page.tsx          # User management + thresholds
│   │   │   │   └── profile/page.tsx        # Name, password, 2FA status
│   │   │   ├── globals.css
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── AuthGuard.tsx
│   │   │   ├── Sidebar.tsx                 # Role-aware nav + profile link
│   │   │   ├── Topbar.tsx
│   │   │   ├── KenyaHeatmap.tsx
│   │   │   └── SubCountyHeatmap.tsx
│   │   └── lib/
│   │       ├── api.ts                      # Axios + 401 refresh interceptor
│   │       ├── auth.ts                     # localStorage user store
│   │       └── socket.ts
│   └── Dockerfile
├── backend/
│   ├── src/
│   │   ├── server.ts
│   │   ├── routes/
│   │   │   ├── auth.ts       # login, verify-otp, set-password, forgot/reset-password
│   │   │   ├── users.ts      # invite-based user creation (county code lookup)
│   │   │   ├── profile.ts    # GET/PATCH profile, POST change-password
│   │   │   ├── alerts.ts     # alerts + threshold management + email on fire
│   │   │   ├── dashboard.ts
│   │   │   ├── counties.ts
│   │   │   ├── topics.ts
│   │   │   └── reports.ts
│   │   ├── services/
│   │   │   └── email.ts      # Nodemailer Gmail — all email send functions
│   │   ├── middleware/
│   │   │   ├── auth.ts       # JWT verification + RBAC
│   │   │   └── audit.ts      # Append-only audit logging
│   │   ├── config/env.ts
│   │   └── lib/prisma.ts
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Data Model

| Model | Key fields |
|-------|-----------|
| `User` | email, passwordHash, firstName?, lastName?, role, countyId?, mfaEnabled, otpCode?, inviteToken?, mustSetPassword, resetToken? |
| `County` | name, code (001–047), region |
| `Topic` | name, category, isActive |
| `SentimentEvent` | countyId, topicId, constituencyId?, subCountyId?, timestamp, sentimentScore, sentimentLabel, source — **no PII** |
| `AlertThreshold` | metricType, thresholdVal, severity, countyId?, topicId? |
| `Alert` | countyId, topicId?, severity, triggerType, status (OPEN/ACKNOWLEDGED/RESOLVED) |
| `AuditLog` | userId?, action, resourceType, metadata (JSON) |

Indexes: `SentimentEvent(timestamp)`, `SentimentEvent(countyId)`, `SentimentEvent(topicId)`, `SentimentEvent(constituencyId)`, `SentimentEvent(subCountyId)`, `Alert(status)`, `Alert(countyId)`.

---

## Security Notes

- All JWT secrets in `.env` must be rotated before production deployment
- The default Docker Compose password (`nyayo_secure_password`) is for local dev only
- Socket.io connections require a valid access token — unauthenticated connections are rejected
- Login endpoint is rate-limited to 15 requests per 15 minutes
- Email OTP codes are bcrypt-hashed before storage and expire after 10 minutes
- Invite tokens and password reset tokens expire after 24 hours and 1 hour respectively
- `SentimentEvent` must never store names, phone numbers, national IDs, or any free-text PII
- `COUNTY_OFFICIAL` data is always county-scoped at the API layer — never rely on client-supplied county filters

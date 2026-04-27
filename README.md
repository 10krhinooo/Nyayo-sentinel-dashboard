Nyayo Sentinel Dashboard – Early Warning System
================================================

A secure, production-ready government analytics platform for monitoring public sentiment across all 47 Kenyan counties. Designed as an **early warning system** for detecting emerging frustration, unrest, or spikes in negative sentiment, with county- and topic-level drill-downs, configurable alerting, and full audit logging.

---

## Architecture

```
Browser → Next.js Frontend (3000) → Express Backend (4000) → PostgreSQL (5432)
                                           ↕ Socket.io (real-time alerts)
```

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Recharts, React Simple Maps |
| Backend | Node.js 20, Express 4, TypeScript, Prisma 5, Socket.io 4 |
| Database | PostgreSQL 16 |
| Auth | JWT (access 15 min / refresh 7 days in httpOnly cookies), TOTP MFA via otplib |
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
```

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

All test accounts use password **`Nyayo2024!`**

| Email | Role | Scope |
|-------|------|-------|
| `admin@sentinel.ke` | National Admin | All 47 counties |
| `analyst@sentinel.ke` | Analyst | All counties (read-only) |
| `nairobi.official@county.ke` | County Official | Nairobi only |
| `mombasa.official@county.ke` | County Official | Mombasa only |
| `kisumu.official@county.ke` | County Official | Kisumu only |
| `nakuru.official@county.ke` | County Official | Nakuru only |

---

## Features

### Authentication & Access Control
- Login page with email/password and optional TOTP MFA
- Role-based navigation — sidebar links are scoped per role:
  - **National Admin**: Dashboard, Heatmap, Topics, Alerts, Reports, Admin
  - **Analyst**: Dashboard, Heatmap, Topics, Alerts, Reports
  - **County Official**: Dashboard, Heatmap, Topics, Alerts (county-scoped data only)
- HTTP-only cookie tokens with transparent refresh on 401
- Audit log on every sensitive action (2xx only, KDPA-compliant)

### Sentiment Overview Dashboard
- National sentiment distribution (positive / neutral / negative %)
- Rolling average sentiment score
- 7-day trend chart
- Top 5 emerging negative topics

### County Heatmap
- Interactive Kenya map — counties shaded by negative sentiment intensity
- Hover tooltip: score, negative share, event volume
- Sortable county data table

### Topic Analysis
- Stacked bar chart of sentiment distribution per topic
- Per-topic count breakdown table

### Early Warning Alerts
- Real-time alerts pushed over Socket.io (scoped to user's county)
- Acknowledge and Resolve buttons with optimistic UI updates
- Pagination (20 per page)
- Two trigger types: `THRESHOLD` (negative %) and `SPIKE` (volume factor)

### Reports
- Authenticated CSV download: Weekly Summary, County Comparison
- Downloads sent via axios blob (auth cookies included)

### Admin Panel *(National Admin only)*
- View and create alert thresholds
- Configure metric type (NEGATIVE_PERCENT 0–100 or SPIKE_FACTOR >1), severity, county, topic

---

## Project Structure

```
nyayo-sentinel-dashboard/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/login/   # Login page (no sidebar)
│   │   │   ├── (dashboard)/    # All protected pages + layout
│   │   │   ├── globals.css
│   │   │   └── layout.tsx      # Root layout (html/body + Inter font)
│   │   ├── components/
│   │   │   ├── AuthGuard.tsx   # Redirects unauthenticated users to /login
│   │   │   ├── Sidebar.tsx     # Role-aware nav + logout
│   │   │   ├── Topbar.tsx      # Page title + open alert count
│   │   │   └── KenyaHeatmap.tsx
│   │   └── lib/
│   │       ├── api.ts          # Axios instance + 401 refresh interceptor
│   │       ├── auth.ts         # localStorage user store (getUser/setUser/clearUser)
│   │       └── socket.ts       # Socket.io client (cookie auth)
│   └── Dockerfile
├── backend/
│   ├── src/
│   │   ├── server.ts           # Express + Socket.io + alert evaluation loop
│   │   ├── routes/             # auth, dashboard, counties, topics, alerts, reports
│   │   ├── middleware/
│   │   │   ├── auth.ts         # JWT verification + RBAC
│   │   │   └── audit.ts        # Append-only audit logging (2xx only)
│   │   ├── config/env.ts       # Zod-validated environment config
│   │   └── lib/prisma.ts       # Prisma singleton
│   ├── prisma/
│   │   ├── schema.prisma       # Data model + performance indexes
│   │   ├── seed.ts             # 47 counties, 12 topics, 7 users, 30-day events
│   │   └── migrations/
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Data Model

| Model | Key fields |
|-------|-----------|
| `User` | email, passwordHash, role (NATIONAL_ADMIN / COUNTY_OFFICIAL / ANALYST), countyId? |
| `County` | name, code (001–047), region |
| `Topic` | name, category, isActive |
| `SentimentEvent` | countyId, topicId, timestamp, sentimentScore (-1→1), sentimentLabel, source — **no PII** |
| `AlertThreshold` | metricType, thresholdVal, severity, countyId?, topicId? |
| `Alert` | countyId, topicId?, severity, triggerType, status (OPEN/ACKNOWLEDGED/RESOLVED) |
| `AuditLog` | userId?, action, resourceType, metadata (JSON) |

Indexes: `SentimentEvent(timestamp)`, `SentimentEvent(countyId)`, `SentimentEvent(topicId)`, `Alert(status)`, `Alert(countyId)`.

---

## Security Notes

- All JWT secrets in `.env` must be rotated before production deployment
- The default Docker Compose password (`nyayo_secure_password`) is for local dev only
- Socket.io connections require a valid access token cookie — unauthenticated connections are rejected
- Login endpoint is rate-limited to 15 requests per 15 minutes
- MFA setup (`POST /auth/mfa/setup`) requires authentication and can only be called for the requesting user's own account
- `SentimentEvent` must never store names, phone numbers, national IDs, or any free-text PII

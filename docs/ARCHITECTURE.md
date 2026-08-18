# Architecture

## System Overview

```
User (browser)
    │
    ▼
Intake Form (React)
    │  POST /api/campaigns
    ▼
API Server (Express 5)
    ├── Validate payload (Zod)
    ├── Persist lead + campaign (status: "processing")
    ├── Call Gemini AI ──── fails? → mark "failed", stop
    ├── Run Smart Logic Layer
    ├── Persist merged result (status: "complete")
    └── Return structured response
    │
    ├── Results Page polls GET /api/campaigns/:id (every 2 s while processing)
    │
    └── Admin Dashboard reads same data via /api/admin/* routes
```

---

## Frontend

**Framework:** React 19 + Vite. Routing via Wouter. Data fetching via TanStack Query. Forms via React Hook Form. UI components from Radix UI + Tailwind CSS.

### Pages

| File | Route | Purpose |
|---|---|---|
| `pages/intake.tsx` | `/` | Campaign intake form. Submits to `POST /api/campaigns`, navigates to result page on success. Shows loading state on submit. |
| `pages/result.tsx` | `/result/:id` | Polls `GET /api/campaigns/:id` every 2 s while status is `processing`. Renders campaign ideas, ad copy cards, channel mix, budget allocation table, A/B test plan table, fit score badge, and risk level once complete. Shows error message if status is `failed`. |
| `pages/admin/login.tsx` | `/admin/login` | Fetches CSRF token on mount (`GET /api/admin/csrf`). Submits password via `POST /api/admin/login` with `X-CSRF-Token` header. |
| `pages/admin/dashboard.tsx` | `/admin/dashboard` | Lists campaigns with lead name, company, budget (₹), status, fit score, risk level. Shows summary stats (total submissions, completion rate, average budget, top channels, status breakdown). Sortable by `createdAt`, `budget`, or `fitScore`. |
| `pages/admin/campaign-detail.tsx` | `/admin/campaigns/:id` | Structured view: idea cards (title, description, rationale), budget allocation table (channel, %, amount in ₹), ad copy cards (headline, body, CTA), A/B test table (variant A vs B per channel), fit score badge, risk level badge, collapsible raw JSON toggle. |
| `pages/not-found.tsx` | `*` | 404 fallback. |

### States handled

- **Loading:** spinner shown while intake submits or while result page polls
- **Error:** API error message displayed on intake form; pipeline failure message on result page
- **Success:** full result rendered on result page; campaign list rendered on dashboard
- **Empty:** dashboard shows empty state when no campaigns exist

---

## Backend

**Framework:** Express 5 (Node.js ESM). Built with esbuild. Served via `node --enable-source-maps dist/index.mjs`.

### API Endpoints

All routes are mounted under `/api`.

#### Public

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/healthz` | Health check. Returns `{ status: "ok" }`. |
| `POST` | `/api/campaigns` | Submit intake form. Runs the full pipeline. Rate limited: 5 req/min/IP. Returns `campaignId` and result immediately (pipeline runs synchronously within the request). |
| `GET` | `/api/campaigns/:id` | Poll for campaign status and result. Used by the results page. |

#### Admin (session-protected)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/csrf` | Issue a signed CSRF cookie. Called by the login page before any POST. |
| `POST` | `/api/admin/login` | Authenticate. Requires CSRF token + passes rate limit (5 failed/15 min/IP). |
| `POST` | `/api/admin/logout` | Destroy session. CSRF-protected. |
| `GET` | `/api/admin/me` | Check active session. Also refreshes the CSRF cookie. |
| `GET` | `/api/admin/campaigns` | List campaigns (joined with leads and campaign_results). Query params: `status`, `sortBy` (`createdAt`\|`budget`\|`fitScore`), `sortOrder` (`asc`\|`desc`), `page`, `limit` (default 20). |
| `GET` | `/api/admin/campaigns/:id` | Full campaign detail including lead contact info and raw AI response. |
| `GET` | `/api/admin/stats` | Aggregate stats: total submissions, completion rate, average budget, top 6 channels by frequency, status breakdown. |

### Request / Response Flow

`POST /api/campaigns`:
1. Zod validates the body against `SubmitCampaignBody`.
2. Server re-checks budget bounds: ≥1, ≤10,000,000.
3. Inserts lead row, inserts campaign row (status `processing`), returns campaign ID to client.
4. Calls Gemini (up to 2 attempts). On failure → inserts campaign_results with error, updates status to `failed`, returns `201` with `status: "failed"`.
5. On AI success → runs Smart Logic Layer.
6. Filters AI ad copy to channels Smart Logic selected.
7. Inserts campaign_results with merged output, updates status to `complete`.
8. Returns `201` with `status: "complete"` and full result.

### Error Handling

- Zod validation failures → `400` with Zod error message.
- Admin CSRF failure → `403 { error: "CSRF token missing|mismatch|invalid" }`.
- Admin rate limit exceeded → `429` with message.
- Admin auth failure → `401 { error: "Invalid password" }` or `401 { error: "Unauthorized" }`.
- CORS violation → `403 { error: "Forbidden: cross-origin request not allowed" }` (JSON, not HTML).
- AI failure → pipeline stops; campaign saved as `failed`; no fabricated output returned.
- Database insert failure → `500`.

---

## Smart Logic Layer

File: `artifacts/api-server/src/lib/smartLogic.ts`

Runs after AI generation succeeds. All logic is deterministic — no network calls, no randomness.

### 5a. Channel Selection

**B2B detection:** audience string checked for any of these keywords (case-insensitive): `b2b`, `business`, `enterprise`, `saas`, `software`, `professional`, `corporate`, `company`, `companies`, `ceo`, `cmo`, `cto`, `manager`, `director`, `executive`, `hr`, `finance`, `legal`, `healthcare`, `medical`, `agency`, `vendor`, `supplier`, `wholesale`.

**Channel cap by budget:**

| Budget | Max channels |
|---|---|
| < $1,000 | 2 |
| $1,000 – $10,000 | 3 |
| > $10,000 | 5 |

**Channel scores (higher = better fit, top N selected):**

B2B audience:

| Channel | Score |
|---|---|
| LinkedIn | 10 |
| Email | 9 |
| Google Search | 7 |
| Meta | 5 |
| Instagram | 3 |
| TikTok | 2 |

B2C audience, budget < $1,000:

| Channel | Score |
|---|---|
| Meta | 9 |
| Instagram | 8 |
| TikTok | 7 |
| Google Search | 6 |
| Email | 5 |
| LinkedIn | 2 |

B2C audience, budget ≥ $1,000:

| Channel | Score |
|---|---|
| Google Search | 10 |
| Meta | 9 |
| Instagram | 8 |
| TikTok | 7 |
| Email | 6 |
| LinkedIn | 3 |

### 5b. Budget Allocation

Starts with equal weights across selected channels. Iteratively drops any channel where the allocation falls below either floor:
- Less than **$100** absolute spend, or
- Less than **10%** of total budget

Iteration repeats until no channel falls below both floors (max 10 iterations). If all channels are dropped, the first channel is kept as a fallback. Final amounts are calculated with the last channel absorbing rounding remainder.

### 5c. A/B Test Plan

One fixed variant pair per channel, defined in a static template map. Each pair:
- **Variant A:** benefit-led (lead with outcome/transformation)
- **Variant B:** urgency-led (time pressure or scarcity)

Each variant has: `angle`, `type`, `hypothesis`, `primaryMetric`.

Primary metrics by channel: Google Search → CTR / Conversion Rate; Meta → CPC / ROAS; Instagram → Engagement Rate / Swipe-Up Rate; TikTok → View-Through Rate (3s) / CPA; LinkedIn → Lead Form Completion Rate / CPL; Email → Open Rate / CTOR.

### 5d. Fit Score (0–100)

Three components summed, capped at 100:

**Budget adequacy (0–40 pts)** — based on average spend per channel:

| Avg per channel | Points |
|---|---|
| ≥ $2,000 | 40 |
| ≥ $1,000 | 35 |
| ≥ $500 | 25 |
| ≥ $200 | 18 |
| ≥ $100 | 10 |
| < $100 | 5 |

**Audience-channel match (0–40 pts)** — average of channel scores for the selected set, divided by 10, multiplied by 40.

**Channel diversity (0–20 pts)**:

| Channels selected | Points |
|---|---|
| ≥ 5 | 20 |
| ≥ 4 | 17 |
| ≥ 3 | 14 |
| ≥ 2 | 10 |
| 1 | 4 |

### 5e. Risk Level

| Condition | Risk |
|---|---|
| Avg per channel < $200 **or** < 2 channels | `high` |
| Avg per channel < $500 **or** ≤ 2 channels | `medium` |
| Avg per channel ≥ $500 **and** ≥ 3 channels | `low` |

---

## Database

**ORM:** Drizzle ORM. **Database:** PostgreSQL.

### `leads`

| Column | Type | Notes |
|---|---|---|
| `id` | `serial` | Primary key |
| `full_name` | `text` | Not null |
| `email` | `text` | Not null |
| `company_name` | `text` | Not null |
| `website` | `text` | Nullable |
| `phone` | `text` | Nullable |
| `created_at` | `timestamptz` | Default: now() |

### `campaigns`

| Column | Type | Notes |
|---|---|---|
| `id` | `serial` | Primary key |
| `lead_id` | `integer` | FK → `leads.id`, not null |
| `product_description` | `text` | Not null |
| `audience` | `text` | Not null |
| `budget` | `numeric(14,2)` | Not null |
| `status` | `text` | `processing` \| `complete` \| `failed`; default `processing` |
| `created_at` | `timestamptz` | Default: now() |

Indexes: `campaigns_lead_id_idx` on `lead_id`; `campaigns_created_at_idx` on `created_at`.

### `campaign_results`

| Column | Type | Notes |
|---|---|---|
| `id` | `serial` | Primary key |
| `campaign_id` | `integer` | FK → `campaigns.id`, not null |
| `channel_mix` | `jsonb` | Array of selected channel names |
| `budget_allocation` | `jsonb` | Array of `{ channel, percentage, amount }` |
| `ai_campaign_ideas` | `jsonb` | Array of `{ title, description, rationale }` from Gemini |
| `ai_ad_copy` | `jsonb` | Array of `{ channel, headline, body, callToAction }` from Gemini, filtered to selected channels |
| `ab_test_plan` | `jsonb` | Array of `{ channel, variantA, variantB }` |
| `fit_score` | `integer` | 0–100 |
| `risk_level` | `text` | `low` \| `medium` \| `high` |
| `raw_ai_response` | `text` | Full raw string from Gemini (for debugging) |
| `error_message` | `text` | Set when AI generation fails; null on success |
| `created_at` | `timestamptz` | Default: now() |

**Note:** `contact info (email, phone, name) is never sent to the Gemini API`. Only `product_description`, `audience`, `budget`, and channel names are included in the prompt.

---

## Admin Dashboard

**Auth:** Single password stored in `ADMIN_PASSWORD` env var. No user accounts.

**Login flow:**
1. Login page (`/admin/login`) calls `GET /api/admin/csrf` on mount to receive a signed `_csrf` cookie.
2. On submit, the frontend reads the `_csrf` cookie and sends it as `X-CSRF-Token` header.
3. Server validates CSRF, then rate-checks (5 failed attempts per IP per 15 min), then compares password.
4. On success, `req.session.isAdmin = true` is stored in the Postgres session store.

**Session store:** `connect-pg-simple`. Sessions are stored in a PostgreSQL `session` table. Session cookie settings: `httpOnly: true`, `secure: true` in production, `sameSite: lax`, `maxAge: 24 hours`. Expired sessions are pruned every hour.

**Dashboard features:**
- Summary stats: total submissions, completion rate (%), average budget, top 6 channels by frequency, status breakdown (processing / complete / failed)
- Paginated campaign list sortable by `createdAt`, `budget`, or `fitScore`; filterable by status
- Campaign detail: structured sections for campaign ideas, budget allocation table, ad copy per channel, A/B test plan table, fit score badge, risk level badge, collapsible raw AI response

---

## Security

### Password comparison

Both the candidate and stored passwords are hashed with SHA-256 before calling `timingSafeEqual`. This ensures equal-length buffers (avoiding the length-leak exception) and constant-time comparison.

```
safeComparePasswords(candidate, stored):
  hashA = SHA256(candidate)
  hashB = SHA256(stored)
  return timingSafeEqual(hashA, hashB)
```

### Rate limiting

- **Admin login:** 5 failed attempts per IP per 15-minute rolling window. `skipSuccessfulRequests: true` — successful logins do not consume slots.
- **Campaign submission:** 5 requests per IP per 60-second window.

Both use `express-rate-limit` with `standardHeaders: true` and `validate: { xForwardedForHeader: false }`.

### Session persistence

`connect-pg-simple` stores sessions in PostgreSQL. Sessions survive server restarts and redeployments. The session table must be created before startup via SQL migration (not at runtime, because the path to `table.sql` inside the bundled build resolves incorrectly).

### CORS

`REPLIT_DOMAINS` (comma-separated) is split into individual origins and prefixed with `https://`. An optional `ALLOWED_ORIGIN` env var adds one more. Requests from unlisted origins are rejected with `403 { error: "Forbidden: cross-origin request not allowed" }`. Same-origin requests (no `Origin` header) are always allowed.

### CSRF (signed double-submit cookie)

1. `GET /api/admin/csrf` (and `GET /api/admin/me`) call `setCsrfCookie`, which generates a 32-byte random token, signs it with HMAC-SHA256 using `SESSION_SECRET`, and sets a readable `_csrf` cookie (`httpOnly: false`, `sameSite: strict`, 1-hour `maxAge`).
2. State-changing routes call `requireCsrf`, which reads both the `_csrf` cookie and `X-CSRF-Token` header, checks they are identical (double-submit), then verifies the HMAC signature using `timingSafeEqual`.
3. A cross-origin attacker cannot read the `_csrf` cookie; without it they cannot produce a matching header.

# AI Campaign Generator

A web application that takes a product description, target audience, and budget and returns a structured marketing campaign plan — channel mix, budget allocation, AI-generated campaign ideas and ad copy, A/B test plan, fit score, and risk level.

---

## Overview

A user fills out an intake form with:
- Contact details (name, email, company, optional website and phone)
- Product or service description
- Target audience description
- Total campaign budget (₹, numeric)

The backend runs an 8-step pipeline:

1. Validates the intake payload server-side (Zod)
2. Persists the lead and campaign with status `processing`
3. Calls Google Gemini to generate 3 campaign ideas and ad copy per channel
4. If Gemini fails, the pipeline stops — no fallback output is fabricated
5. Runs the Smart Logic Layer: channel selection, budget allocation, A/B test plan, fit score, risk level (all deterministic)
6. Filters AI ad copy to only the channels Smart Logic selected
7. Persists the merged output and updates status to `complete`
8. Returns the structured result; the results page also polls `GET /api/campaigns/:id` every 2 s while processing

An admin dashboard (password-protected) shows all submissions, summary stats, and a structured detail view for each campaign.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Radix UI, Wouter, TanStack Query, React Hook Form |
| Backend | Node.js (ESM), Express 5, esbuild |
| Database | PostgreSQL, Drizzle ORM |
| AI | Google Gemini (`gemini-3.6-flash`) via `@google/generative-ai` |
| Sessions | `connect-pg-simple` (PostgreSQL-backed) |
| Logging | pino + pino-http |
| Package manager | pnpm (workspace monorepo) |
| Hosting | Replit |

---

## Environment Variables

Set these before running. None have defaults that are safe for production.

| Name | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `ADMIN_PASSWORD` | Yes | Plain-text password for admin login |
| `SESSION_SECRET` | Yes | Secret used to sign session cookies and CSRF tokens |
| `REPLIT_DOMAINS` | Auto (Replit) | Comma-separated proxy domains; used to build the CORS allowlist |
| `ALLOWED_ORIGIN` | No | Optional additional CORS origin (e.g. custom domain) |
| `LOG_LEVEL` | No | pino log level (default: `info`) |
| `NODE_ENV` | No | Set to `production` to enable secure cookies |

---

## Running Locally

```bash
# Install dependencies
pnpm install

# Run database migrations (creates tables including the session table)
psql $DATABASE_URL -f scripts/migrate.sql

# Start the API server (builds then starts)
pnpm --filter @workspace/api-server run dev

# Start the frontend (separate terminal)
pnpm --filter @workspace/campaign-generator run dev
```

The API server listens on the port set by the `PORT` environment variable. The frontend dev server proxies `/api` requests to it.

---

## Links

- **GitHub:** https://github.com/varunchaurasia23/AI-Campaign-Generator
- **Live app:** https://campaign-automation-platform.replit.app

---

## Folder Structure

```
/
├── artifacts/
│   ├── api-server/          Express 5 API server (TypeScript, ESM, esbuild)
│   │   └── src/
│   │       ├── app.ts       Express app setup (CORS, sessions, middleware)
│   │       ├── routes/      API route handlers
│   │       ├── lib/         gemini.ts, smartLogic.ts, logger.ts
│   │       └── middlewares/ csrf.ts, adminAuth.ts
│   └── campaign-generator/  React + Vite frontend
│       └── src/
│           ├── pages/       intake, result, admin/login, admin/dashboard, admin/campaign-detail
│           ├── components/  UI components (Radix UI based)
│           └── hooks/       TanStack Query hooks
├── lib/
│   ├── api-client-react/    Generated TanStack Query API client
│   ├── api-spec/            OpenAPI specification
│   ├── api-zod/             Zod request/response schemas (generated from OpenAPI)
│   └── db/                  Drizzle ORM schema definitions and PostgreSQL pool
├── scripts/                 Database migration SQL scripts
├── pnpm-workspace.yaml
└── package.json
```

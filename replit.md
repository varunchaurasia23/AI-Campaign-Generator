# AI Campaign Generator (Nexus)

A marketing workflow automation platform where marketers submit campaign inputs via a public intake form and get AI-powered campaign strategies with smart channel selection, budget allocation, A/B test plans, and ad copy — all driven by a deterministic logic layer + Gemini AI.

## Run & Operate

- `pnpm --filter @workspace/campaign-generator run dev` — frontend dev server
- `pnpm --filter @workspace/api-server run dev` — API server (port 8080, proxied at /api)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks + Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Required Secrets

Add these in Replit Secrets before testing AI or admin features:
- `GEMINI_API_KEY` — Google Gemini API key (for AI campaign generation)
- `ADMIN_PASSWORD` — password for the admin dashboard login
- `SESSION_SECRET` — already set (used for signing session cookies)
- `DATABASE_URL` — auto-provided by Replit Postgres

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (wouter router, TanStack Query, shadcn/ui components, tailwindcss)
- API: Express 5, express-session, express-rate-limit
- AI: @google/generative-ai (Gemini 2.0 Flash, server-side only)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (zod/v4 path), drizzle-zod, Orval codegen
- Build: esbuild (API server CJS bundle)

## Where Things Live

- `artifacts/campaign-generator/src/pages/` — all frontend pages
  - `intake.tsx` — public campaign form (/)
  - `result.tsx` — results page with polling (/results/:id)
  - `admin/login.tsx` — admin password gate (/admin/login)
  - `admin/dashboard.tsx` — admin list view + stats (/admin)
  - `admin/campaign-detail.tsx` — admin detail view (/admin/campaigns/:id)
- `artifacts/api-server/src/routes/` — Express routes
  - `campaigns.ts` — POST /campaigns (rate-limited), GET /campaigns/:id
  - `admin.ts` — all /admin/* routes (login, logout, me, list, detail, stats)
- `artifacts/api-server/src/lib/` — business logic
  - `smartLogic.ts` — deterministic channel selection, budget allocation, A/B tests, fit score
  - `gemini.ts` — Gemini API integration (server-side only, retries once on parse failure)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/db/src/schema/` — DB schema: leads, campaigns, campaign_results

## Architecture Decisions

- **No client-side AI keys**: GEMINI_API_KEY lives only in server env; API sends product/audience/budget/channels to Gemini, never lead contact info.
- **Smart logic runs synchronously before AI**: channel selection, budget allocation, A/B test plan, and fit score are all deterministic and don't depend on Gemini. If Gemini fails, the logic-layer output is still saved.
- **AI failure path**: on parse failure, retries once; if still failing, marks campaign status "failed" with a clear error message — never fabricates output.
- **Session-based admin auth**: every admin API route checks `req.session.isAdmin` server-side via `requireAdmin` middleware. No client-only protection.
- **Rate limiting**: 5 POST /campaigns per minute per IP via express-rate-limit (trust proxy enabled for X-Forwarded-For).
- **zod/v4 compat**: Orval codegen generates zod v4 APIs (`zod.email()`, `zod.int()`); codegen script post-processes the import path. tsconfig paths alias also applied in lib/api-zod.

## Product

**Public flow**: Marketer fills intake form → backend validates, saves lead + campaign → runs smart logic layer → calls Gemini API → merges results → returns structured report. Results page polls every 2s while processing.

**Admin flow**: Admin logs in at /admin/login with ADMIN_PASSWORD → session cookie set → can list all campaigns (filter by status, sort by date/budget/fit score), view full campaign detail including raw AI response, and see summary stats.

## User Preferences

_Populate as you build._

## Gotchas

- Run `pnpm --filter @workspace/api-spec run codegen` after every OpenAPI spec change — this both generates the client hooks AND runs `typecheck:libs`. The codegen script post-processes `lib/api-zod/src/generated/api.ts` to replace `from 'zod'` with `from 'zod/v4'` (Orval generates v4-style calls but the workspace uses zod 3.25.x with v4 under the /v4 sub-path).
- After any change to `lib/db/src/schema/`, run `pnpm run typecheck:libs` before checking the api-server typecheck, otherwise you'll see stale @workspace/db exports.
- Do NOT remove the `import "./types/session"` pattern if re-adding session type augmentation — esbuild can't bundle .d.ts files as imports. Instead, put the `.d.ts` in `src/types/` and let tsconfig `include: ["src"]` pick it up.
- The `buttonVariants` function in `artifacts/campaign-generator/src/components/ui/button.tsx` must be kept as a named export — alert-dialog, calendar, and pagination components import it.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

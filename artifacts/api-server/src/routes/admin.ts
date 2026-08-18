import { Router, type IRouter } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import rateLimit from "express-rate-limit";
import { eq, desc, asc, count, avg, sql } from "drizzle-orm";
import {
  db,
  leadsTable,
  campaignsTable,
  campaignResultsTable,
} from "@workspace/db";
import {
  AdminLoginBody,
  AdminListCampaignsQueryParams,
  AdminGetCampaignParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/adminAuth";
import { requireCsrf, setCsrfCookie } from "../middlewares/csrf";

const router: IRouter = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Constant-time password comparison.
 *
 * Both strings are hashed with SHA-256 before comparison so that
 * timingSafeEqual always receives equal-length buffers — it throws on
 * length mismatch, which would otherwise leak information about the
 * expected password length.
 */
function safeComparePasswords(candidate: string, expected: string): boolean {
  const hashA = createHash("sha256").update(candidate).digest();
  const hashB = createHash("sha256").update(expected).digest();
  try {
    return timingSafeEqual(hashA, hashB);
  } catch {
    return false;
  }
}

// ─── Rate limiters ────────────────────────────────────────────────────────────

/**
 * Admin login rate limit: max 5 *failed* attempts per IP per 15 minutes.
 *
 * `skipSuccessfulRequests: true` means HTTP 2xx responses are not counted,
 * so a correct password never burns a slot.  A wrong password (401) or any
 * other error (400, 500) is counted.
 *
 * This is intentionally separate from the campaign submission rate limiter.
 */
const adminLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15-minute rolling window
  max: 5,                       // 5 failed attempts before lockout
  skipSuccessfulRequests: true, // successful logins (200) never counted
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    error:
      "Too many failed login attempts from this IP. " +
      "Please wait 15 minutes before trying again.",
  },
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/csrf
 * Issues a signed CSRF cookie that the frontend must echo back as
 * X-CSRF-Token on all state-changing admin requests.
 * This endpoint is called by the login page before any POST.
 */
router.get("/admin/csrf", setCsrfCookie, (_req, res): void => {
  res.json({ ok: true });
});

/**
 * POST /api/admin/login
 *
 * Protected by:
 *  - CSRF token validation (requireCsrf)
 *  - Per-IP rate limit on failures (adminLoginRateLimit) — checked after CSRF
 *    so attackers cannot consume slots via CSRF-invalid requests
 *  - Constant-time password comparison (safeComparePasswords)
 */
router.post(
  "/admin/login",
  requireCsrf,
  adminLoginRateLimit,
  async (req, res): Promise<void> => {
    const parsed = AdminLoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Password is required" });
      return;
    }

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      req.log.error("ADMIN_PASSWORD env var is not set");
      res.status(500).json({ error: "Admin authentication is not configured" });
      return;
    }

    if (!safeComparePasswords(parsed.data.password, adminPassword)) {
      req.log.warn({ ip: req.ip }, "Failed admin login attempt");
      res.status(401).json({ error: "Invalid password" });
      return;
    }

    req.session.isAdmin = true;
    req.log.info({ ip: req.ip }, "Admin login successful");
    res.json({ authenticated: true });
  }
);

/**
 * POST /api/admin/logout
 * CSRF-protected to prevent forced logouts via cross-site request.
 */
router.post("/admin/logout", requireCsrf, (req, res): void => {
  req.session.destroy((err) => {
    if (err) {
      req.log.error({ err }, "Failed to destroy session");
    }
  });
  res.json({ authenticated: false });
});

/**
 * GET /api/admin/me
 * Check if admin session is active (server-side session check).
 * Also refreshes the CSRF cookie so it stays valid during an active session.
 */
router.get("/admin/me", setCsrfCookie, (req, res): void => {
  if (req.session?.isAdmin) {
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
});

/**
 * GET /api/admin/campaigns
 * List all campaigns with lead info, sortable/filterable.
 * PROTECTED — requires active admin session.
 */
router.get("/admin/campaigns", requireAdmin, async (req, res): Promise<void> => {
  const queryParsed = AdminListCampaignsQueryParams.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ error: queryParsed.error.message });
    return;
  }

  const {
    status: statusFilter,
    sortBy = "createdAt",
    sortOrder = "desc",
    page = 1,
    limit = 20,
  } = queryParsed.data;

  // Allowlisted sort columns to prevent injection
  const ALLOWED_SORT_COLS = ["createdAt", "budget", "fitScore"] as const;
  const safeSortBy = ALLOWED_SORT_COLS.includes(sortBy as any) ? sortBy : "createdAt";
  const safeOrder = sortOrder === "asc" ? "asc" : "desc";

  const offset = (page - 1) * limit;

  const baseConditions = statusFilter
    ? eq(campaignsTable.status, statusFilter)
    : undefined;

  const [countRow] = await db
    .select({ total: count() })
    .from(campaignsTable)
    .where(baseConditions);

  const total = countRow?.total ?? 0;

  const orderClause = (() => {
    if (safeSortBy === "fitScore") {
      return safeOrder === "asc"
        ? asc(campaignResultsTable.fitScore)
        : desc(campaignResultsTable.fitScore);
    }
    if (safeSortBy === "budget") {
      return safeOrder === "asc"
        ? asc(campaignsTable.budget)
        : desc(campaignsTable.budget);
    }
    return safeOrder === "asc"
      ? asc(campaignsTable.createdAt)
      : desc(campaignsTable.createdAt);
  })();

  const rows = await db
    .select({
      id: campaignsTable.id,
      leadName: leadsTable.fullName,
      companyName: leadsTable.companyName,
      budget: campaignsTable.budget,
      status: campaignsTable.status,
      fitScore: campaignResultsTable.fitScore,
      riskLevel: campaignResultsTable.riskLevel,
      createdAt: campaignsTable.createdAt,
    })
    .from(campaignsTable)
    .innerJoin(leadsTable, eq(campaignsTable.leadId, leadsTable.id))
    .leftJoin(
      campaignResultsTable,
      eq(campaignResultsTable.campaignId, campaignsTable.id)
    )
    .where(baseConditions)
    .orderBy(orderClause)
    .limit(limit)
    .offset(offset);

  res.json({
    campaigns: rows.map((r) => ({
      id: r.id,
      leadName: r.leadName,
      companyName: r.companyName,
      budget: Number(r.budget),
      status: r.status,
      fitScore: r.fitScore ?? null,
      riskLevel: r.riskLevel ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
  });
});

/**
 * GET /api/admin/campaigns/:id
 * Full campaign detail including lead info and raw AI response.
 * PROTECTED — requires active admin session.
 */
router.get("/admin/campaigns/:id", requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = AdminGetCampaignParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: "Invalid campaign ID" });
    return;
  }

  const [row] = await db
    .select()
    .from(campaignsTable)
    .innerJoin(leadsTable, eq(campaignsTable.leadId, leadsTable.id))
    .leftJoin(
      campaignResultsTable,
      eq(campaignResultsTable.campaignId, campaignsTable.id)
    )
    .where(eq(campaignsTable.id, params.data.id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const { campaigns: campaign, leads: lead, campaign_results: result } = row;

  res.json({
    id: campaign.id,
    leadName: lead.fullName,
    leadEmail: lead.email,
    companyName: lead.companyName,
    website: lead.website ?? null,
    phone: lead.phone ?? null,
    budget: Number(campaign.budget),
    productDescription: campaign.productDescription,
    targetAudience: campaign.audience,
    status: campaign.status,
    createdAt: campaign.createdAt.toISOString(),
    result: result
      ? {
          channelMix: result.channelMix ?? [],
          budgetAllocation: result.budgetAllocation ?? [],
          abTestPlan: result.abTestPlan ?? [],
          campaignIdeas: result.aiCampaignIdeas ?? null,
          adCopy: result.aiAdCopy ?? null,
          fitScore: result.fitScore ?? 0,
          riskLevel: result.riskLevel ?? null,
          errorMessage: result.errorMessage ?? null,
        }
      : null,
    rawAiResponse: result?.rawAiResponse ?? null,
  });
});

/**
 * GET /api/admin/stats
 * Summary statistics for the admin dashboard.
 * PROTECTED — requires active admin session.
 */
router.get("/admin/stats", requireAdmin, async (req, res): Promise<void> => {
  const [totalRow] = await db
    .select({ total: count() })
    .from(campaignsTable);

  const totalSubmissions = totalRow?.total ?? 0;

  const statusRows = await db
    .select({ status: campaignsTable.status, cnt: count() })
    .from(campaignsTable)
    .groupBy(campaignsTable.status);

  const statusBreakdown = { processing: 0, complete: 0, failed: 0 };
  for (const row of statusRows) {
    if (row.status === "processing") statusBreakdown.processing = Number(row.cnt);
    else if (row.status === "complete") statusBreakdown.complete = Number(row.cnt);
    else if (row.status === "failed") statusBreakdown.failed = Number(row.cnt);
  }

  const completionRate =
    totalSubmissions > 0
      ? Math.round((statusBreakdown.complete / totalSubmissions) * 1000) / 10
      : 0;

  const [avgRow] = await db
    .select({ avgBudget: avg(campaignsTable.budget) })
    .from(campaignsTable);
  const averageBudget = Math.round(Number(avgRow?.avgBudget ?? 0) * 100) / 100;

  const channelRows = await db.execute(sql`
    SELECT
      channel_value,
      COUNT(*) AS cnt
    FROM (
      SELECT jsonb_array_elements_text(channel_mix) AS channel_value
      FROM campaign_results
      WHERE channel_mix IS NOT NULL
    ) sub
    GROUP BY channel_value
    ORDER BY cnt DESC
    LIMIT 6
  `);

  const topChannels = (channelRows.rows as { channel_value: string; cnt: string }[]).map((r) => ({
    channel: r.channel_value,
    count: Number(r.cnt),
  }));

  res.json({
    totalSubmissions,
    completionRate,
    averageBudget,
    topChannels,
    statusBreakdown,
  });
});

export default router;

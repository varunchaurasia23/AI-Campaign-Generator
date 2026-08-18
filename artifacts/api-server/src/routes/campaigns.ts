import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db, leadsTable, campaignsTable, campaignResultsTable } from "@workspace/db";
import {
  SubmitCampaignBody,
  GetCampaignParams,
} from "@workspace/api-zod";
import { runSmartLogic } from "../lib/smartLogic";
import { generateCampaignWithGemini } from "../lib/gemini";

const router: IRouter = Router();

// Rate limit: 5 requests per minute per IP
// trust proxy is set in app.ts so req.ip resolves correctly for IPv4/IPv6
const campaignRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: "Too many requests. Please wait a minute before submitting again." },
});

/**
 * POST /api/campaigns
 *
 * Full pipeline in sequential order:
 *   STEP 1 — User Input        validate intake payload server-side
 *   STEP 2 — Frontend (UI)     loading state shown on submit (intake.tsx)
 *   STEP 3 — Backend API       re-validate + persist lead & campaign (status "processing")
 *   STEP 4 — AI Generation     call Gemini; hard stop on failure (no fabricated output)
 *   STEP 5 — Smart Logic Layer channels, budget, A/B tests, fit score, risk level
 *   STEP 6 — Database          persist merged output, update status "complete"
 *   STEP 7 — Admin Dashboard   reads completed data (admin.ts routes)
 *   STEP 8 — Structured Output return final report to client (results page polls this)
 */
router.post("/campaigns", campaignRateLimit, async (req, res): Promise<void> => {

  // ═══════════════════════════════════════════════════════════════
  // PIPELINE STEP 1 — User Input
  // Receive and validate the intake payload (contact info + campaign
  // inputs) server-side using Zod. All fields are required except
  // website and phone. Never trust client values at any later step.
  // ═══════════════════════════════════════════════════════════════
  req.log.info("Pipeline Step 1: validating intake payload");
  const parsed = SubmitCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    fullName,
    email,
    companyName,
    website,
    phone,
    productDescription,
    targetAudience,
    budget,
  } = parsed.data;

  // Additional server-side budget bounds check (beyond Zod min:1)
  if (typeof budget !== "number" || budget < 1) {
    res.status(400).json({ error: "Budget must be at least $1" });
    return;
  }
  if (budget > 10_000_000) {
    res.status(400).json({ error: "Budget exceeds maximum allowed value" });
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // PIPELINE STEP 2 — Frontend (UI)
  // The client shows a loading state immediately on submit and
  // polls GET /campaigns/:id for status changes.
  // Implemented in: artifacts/campaign-generator/src/pages/intake.tsx
  //                 artifacts/campaign-generator/src/pages/result.tsx
  // (No server action at this step — noted here for pipeline traceability.)
  // ═══════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════
  // PIPELINE STEP 3 — Backend API
  // Re-validate all fields server-side (done above). Persist the
  // lead and campaign row with status "processing" so the results
  // page can start polling immediately while the pipeline runs.
  // ═══════════════════════════════════════════════════════════════
  req.log.info("Pipeline Step 3: persisting lead and campaign (status=processing)");

  const [lead] = await db
    .insert(leadsTable)
    .values({ fullName, email, companyName, website: website ?? null, phone: phone ?? null })
    .returning();

  if (!lead) {
    req.log.error("Failed to insert lead");
    res.status(500).json({ error: "Failed to save submission" });
    return;
  }

  const [campaign] = await db
    .insert(campaignsTable)
    .values({
      leadId: lead.id,
      productDescription,
      audience: targetAudience,
      budget: String(budget),
      status: "processing",
    })
    .returning();

  if (!campaign) {
    req.log.error("Failed to insert campaign");
    res.status(500).json({ error: "Failed to save campaign" });
    return;
  }

  // ═══════════════════════════════════════════════════════════════
  // PIPELINE STEP 4 — AI Generation
  // Call the Gemini API server-side using GEMINI_API_KEY from Secrets.
  // Sends only: productDescription, targetAudience, budget, channels.
  // NEVER sends lead contact info (email, phone, name) to the AI.
  //
  // If the AI call fails (network error, parse failure after 1 retry,
  // or API key not set) → mark the campaign as "failed", persist the
  // error, and STOP the pipeline here. The Smart Logic Layer (Step 5)
  // does NOT run. No output is fabricated.
  // ═══════════════════════════════════════════════════════════════
  req.log.info({ campaignId: campaign.id }, "Pipeline Step 4: calling Gemini AI");
  const aiStartMs = Date.now();

  // All possible channels are passed so Gemini generates ad copy for each.
  // Smart Logic (Step 5) will select the actual subset; ad copy is filtered
  // down to those channels before persisting.
  const ALL_CHANNELS = ["LinkedIn", "Email", "Google Search", "Meta", "Instagram", "TikTok"];
  const aiResult = await generateCampaignWithGemini(
    productDescription,
    targetAudience,
    budget,
    ALL_CHANNELS
  );

  const aiLatencyMs = Date.now() - aiStartMs;

  if ("error" in aiResult) {
    // Hard stop — do not proceed to Smart Logic Layer
    req.log.error(
      { campaignId: campaign.id, latencyMs: aiLatencyMs, error: aiResult.error },
      "Pipeline Step 4: AI generation failed — pipeline halted"
    );

    await db.insert(campaignResultsTable).values({
      campaignId: campaign.id,
      rawAiResponse: aiResult.rawResponse ?? null,
      errorMessage: aiResult.error,
    });

    await db
      .update(campaignsTable)
      .set({ status: "failed" })
      .where(eq(campaignsTable.id, campaign.id));

    res.status(201).json({
      campaignId: campaign.id,
      status: "failed",
      result: {
        channelMix: [],
        budgetAllocation: [],
        abTestPlan: [],
        campaignIdeas: null,
        adCopy: null,
        fitScore: 0,
        riskLevel: null,
        errorMessage: aiResult.error,
      },
    });
    return;
  }

  req.log.info(
    { campaignId: campaign.id, latencyMs: aiLatencyMs },
    "Pipeline Step 4: AI generation succeeded"
  );

  // ═══════════════════════════════════════════════════════════════
  // PIPELINE STEP 5 — Smart Logic Layer (priority, scoring, risk)
  // Runs after AI Generation has confirmed output. AI output is
  // passed in as context so the logic layer can incorporate it
  // into scoring. All rules are deterministic:
  //   5a. Channel selection   — budget tier + audience type (B2B/B2C)
  //   5b. Budget allocation   — equal split + min-spend floor + redistribution
  //   5c. A/B test variants   — benefit-led vs urgency-led per channel
  //   5d. Fit score (0–100)   — budget adequacy + audience-channel match + diversity
  //   5e. Risk level          — low / medium / high (budget adequacy + diversity)
  // ═══════════════════════════════════════════════════════════════
  req.log.info({ campaignId: campaign.id }, "Pipeline Step 5: running Smart Logic Layer");

  const logicResult = runSmartLogic(
    productDescription,
    targetAudience,
    budget,
    {
      campaignIdeas: aiResult.output.campaignIdeas as unknown[],
      adCopy: aiResult.output.adCopy as unknown[],
    }
  );

  req.log.info(
    {
      campaignId: campaign.id,
      channels: logicResult.channelMix,
      fitScore: logicResult.fitScore,
      riskLevel: logicResult.riskLevel,
    },
    "Pipeline Step 5: Smart Logic complete"
  );

  // ═══════════════════════════════════════════════════════════════
  // PIPELINE STEP 6 — Database (store & retrieve)
  // Persist the merged AI output + Smart Logic output into
  // campaign_results. Update campaign status to "complete".
  // This same data is read by:
  //   • GET /campaigns/:id       — user-facing result page
  //   • GET /admin/campaigns     — admin list view
  //   • GET /admin/campaigns/:id — admin detail view
  //   • GET /admin/stats         — admin summary stats
  // ═══════════════════════════════════════════════════════════════
  req.log.info({ campaignId: campaign.id }, "Pipeline Step 6: persisting merged output to DB");

  // Filter AI-generated ad copy to only the channels Smart Logic selected.
  // Gemini wrote copy for all 6 possible channels; we keep only the subset.
  const selectedChannelSet = new Set(logicResult.channelMix);
  const filteredAdCopy = aiResult.output.adCopy.filter(
    (item) => selectedChannelSet.has(item.channel)
  );

  await db.insert(campaignResultsTable).values({
    campaignId: campaign.id,
    channelMix: logicResult.channelMix,
    budgetAllocation: logicResult.budgetAllocation,
    aiCampaignIdeas: aiResult.output.campaignIdeas,
    aiAdCopy: filteredAdCopy,
    abTestPlan: logicResult.abTestPlan,
    fitScore: logicResult.fitScore,
    riskLevel: logicResult.riskLevel,
    rawAiResponse: aiResult.rawResponse,
    errorMessage: null,
  });

  await db
    .update(campaignsTable)
    .set({ status: "complete" })
    .where(eq(campaignsTable.id, campaign.id));

  // ═══════════════════════════════════════════════════════════════
  // PIPELINE STEPS 7 & 8 — Admin Dashboard + Structured Output
  // Step 7: Admin reads from DB via /admin/campaigns routes (admin.ts).
  // Step 8: Return the final structured report to the client.
  //         The results page (result.tsx) displays this once complete,
  //         rendering: campaign ideas, ad copy, channel mix, budget
  //         allocation, A/B test plan, fit score, and risk level.
  // ═══════════════════════════════════════════════════════════════
  req.log.info({ campaignId: campaign.id }, "Pipeline complete: returning structured output");

  res.status(201).json({
    campaignId: campaign.id,
    status: "complete",
    result: {
      channelMix: logicResult.channelMix,
      budgetAllocation: logicResult.budgetAllocation,
      abTestPlan: logicResult.abTestPlan,
      campaignIdeas: aiResult.output.campaignIdeas,
      adCopy: filteredAdCopy,
      fitScore: logicResult.fitScore,
      riskLevel: logicResult.riskLevel,
      errorMessage: null,
    },
  });
});

/**
 * GET /api/campaigns/:id
 *
 * Pipeline Step 8 — Structured Output (poll endpoint).
 * Returns campaign status and result for the user-facing results page.
 * The client polls every 2 s while status is "processing".
 */
router.get("/campaigns/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetCampaignParams.safeParse({ id: rawId });
  if (!params.success) {
    res.status(400).json({ error: "Invalid campaign ID" });
    return;
  }

  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, params.data.id))
    .limit(1);

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const [result] = await db
    .select()
    .from(campaignResultsTable)
    .where(eq(campaignResultsTable.campaignId, campaign.id))
    .limit(1);

  res.json({
    id: campaign.id,
    status: campaign.status,
    budget: Number(campaign.budget),
    productDescription: campaign.productDescription,
    targetAudience: campaign.audience,
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
  });
});

export default router;

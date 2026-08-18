/**
 * ═══════════════════════════════════════════════════════════════
 * PIPELINE STEP 5 — Smart Logic Layer (priority, scoring, risk)
 * ═══════════════════════════════════════════════════════════════
 *
 * Runs AFTER AI Generation (Step 4) has succeeded. Receives the
 * AI output as context and applies deterministic rules to produce:
 *
 *  1. Channel selection   — budget tier + audience type (B2B/B2C)
 *  2. Budget allocation   — equal split with min-spend floor ($100 / 10%)
 *  3. A/B test variants   — benefit-led vs urgency-led per channel
 *  4. Fit score (0–100)   — budget adequacy + audience-channel match + diversity
 *  5. Risk level          — low / medium / high based on budget adequacy & diversity
 *
 * All logic is purely deterministic. No network calls, no randomness.
 */

export type Channel =
  | "Google Search"
  | "Meta"
  | "Instagram"
  | "TikTok"
  | "LinkedIn"
  | "Email";

export type RiskLevel = "low" | "medium" | "high";

export interface ChannelAllocation {
  channel: string;
  percentage: number;
  amount: number;
}

export interface ABTestVariant {
  angle: string;
  type: string;
  hypothesis: string;
  primaryMetric: string;
}

export interface ABTestPlanItem {
  channel: string;
  variantA: ABTestVariant;
  variantB: ABTestVariant;
}

/** Context passed from the AI Generation step (Step 4) into Smart Logic (Step 5). */
export interface AIGenerationOutput {
  campaignIdeas: unknown[];
  adCopy: unknown[];
}

export interface SmartLogicResult {
  channelMix: string[];
  budgetAllocation: ChannelAllocation[];
  abTestPlan: ABTestPlanItem[];
  fitScore: number;
  /** Deterministic risk assessment: low / medium / high */
  riskLevel: RiskLevel;
}

// ─── Internals ────────────────────────────────────────────────────────────────

const ALL_CHANNELS: Channel[] = [
  "Google Search",
  "Meta",
  "Instagram",
  "TikTok",
  "LinkedIn",
  "Email",
];

const B2B_KEYWORDS = [
  "b2b",
  "business",
  "enterprise",
  "saas",
  "software",
  "professional",
  "corporate",
  "company",
  "companies",
  "ceo",
  "cmo",
  "cto",
  "manager",
  "director",
  "executive",
  "hr",
  "finance",
  "legal",
  "healthcare",
  "medical",
  "agency",
  "vendor",
  "supplier",
  "wholesale",
];

function isB2B(audience: string): boolean {
  const lower = audience.toLowerCase();
  return B2B_KEYWORDS.some((kw) => lower.includes(kw));
}

function getMaxChannels(budget: number): number {
  if (budget < 1000) return 2;
  if (budget <= 10000) return 3;
  return 5;
}

// Scores represent relative effectiveness (higher = better fit for audience)
function channelScores(b2b: boolean, budget: number): Record<Channel, number> {
  if (b2b) {
    return {
      LinkedIn: 10,
      Email: 9,
      "Google Search": 7,
      Meta: 5,
      Instagram: 3,
      TikTok: 2,
    };
  }
  // B2C
  if (budget < 1000) {
    return {
      Meta: 9,
      Instagram: 8,
      TikTok: 7,
      "Google Search": 6,
      Email: 5,
      LinkedIn: 2,
    };
  }
  return {
    "Google Search": 10,
    Meta: 9,
    Instagram: 8,
    TikTok: 7,
    Email: 6,
    LinkedIn: 3,
  };
}

function selectChannels(budget: number, audience: string): Channel[] {
  const b2b = isB2B(audience);
  const maxChannels = getMaxChannels(budget);
  const scores = channelScores(b2b, budget);

  const sorted = ALL_CHANNELS.slice().sort((a, b) => scores[b] - scores[a]);
  return sorted.slice(0, maxChannels);
}

const MIN_SPEND_FLOOR = 100;
const MIN_SPEND_PCT = 0.1;

function allocateBudget(channels: Channel[], budget: number): ChannelAllocation[] {
  // Start with equal distribution
  const weights: Record<string, number> = {};
  for (const ch of channels) {
    weights[ch] = 1;
  }

  // Iteratively drop channels that fall below the minimum viable floor
  let active = [...channels];
  let iterations = 0;
  while (active.length > 0 && iterations < 10) {
    iterations++;
    const total = active.reduce((s, ch) => s + weights[ch], 0);
    let dropped = false;

    for (const ch of active) {
      const pct = weights[ch] / total;
      const amount = budget * pct;
      if (pct < MIN_SPEND_PCT || amount < MIN_SPEND_FLOOR) {
        active = active.filter((c) => c !== ch);
        dropped = true;
        break;
      }
    }

    if (!dropped) break;
  }

  if (active.length === 0) {
    // Fallback: keep at least one channel
    active = [channels[0]];
  }

  // Final allocation with normalized weights
  const totalWeight = active.reduce((s, ch) => s + weights[ch], 0);
  const result: ChannelAllocation[] = [];

  let remaining = budget;
  for (let i = 0; i < active.length; i++) {
    const ch = active[i];
    const isLast = i === active.length - 1;
    const pct = weights[ch] / totalWeight;
    const amount = isLast ? remaining : Math.round(budget * pct * 100) / 100;
    remaining -= amount;

    result.push({
      channel: ch,
      percentage: Math.round(pct * 1000) / 10, // 1 decimal place
      amount: Math.round(amount * 100) / 100,
    });
  }

  return result;
}

const AB_TEST_TEMPLATES: Record<Channel, { variantA: ABTestVariant; variantB: ABTestVariant }> = {
  "Google Search": {
    variantA: {
      angle: "Benefit-Led: Lead with the primary outcome",
      type: "benefit-led",
      hypothesis:
        "Users searching with high intent respond better to clear outcome statements than fear-based messaging",
      primaryMetric: "Click-Through Rate (CTR)",
    },
    variantB: {
      angle: "Urgency-Led: Limited time / scarcity framing",
      type: "urgency-led",
      hypothesis:
        "Adding time pressure to search ads increases conversion rate for bottom-funnel queries",
      primaryMetric: "Conversion Rate",
    },
  },
  Meta: {
    variantA: {
      angle: "Benefit-Led: Showcase the transformation",
      type: "benefit-led",
      hypothesis:
        "Aspirational before/after creative outperforms problem-focused ads in Meta feed placements",
      primaryMetric: "Cost Per Click (CPC)",
    },
    variantB: {
      angle: "Urgency-Led: Social proof + deadline",
      type: "urgency-led",
      hypothesis:
        "Combining social proof with a countdown increases purchase intent among warm audiences",
      primaryMetric: "Return on Ad Spend (ROAS)",
    },
  },
  Instagram: {
    variantA: {
      angle: "Benefit-Led: Lifestyle / aspiration imagery",
      type: "benefit-led",
      hypothesis:
        "Visual-first benefit storytelling drives higher saves and profile visits on Instagram",
      primaryMetric: "Engagement Rate",
    },
    variantB: {
      angle: "Urgency-Led: Flash sale / exclusive offer",
      type: "urgency-led",
      hypothesis:
        "Exclusive offers with urgency signals outperform evergreen content in Story placements",
      primaryMetric: "Swipe-Up Rate",
    },
  },
  TikTok: {
    variantA: {
      angle: "Benefit-Led: Native storytelling, hook in first 3 seconds",
      type: "benefit-led",
      hypothesis:
        "Authentic narrative-style videos with clear value props outperform polished ads on TikTok",
      primaryMetric: "View-Through Rate (3s)",
    },
    variantB: {
      angle: "Urgency-Led: Challenge / trend format with CTA",
      type: "urgency-led",
      hypothesis:
        "Trend-piggybacking with a limited-time offer drives higher conversion on TikTok younger demos",
      primaryMetric: "Cost Per Acquisition (CPA)",
    },
  },
  LinkedIn: {
    variantA: {
      angle: "Benefit-Led: ROI / business outcome focus",
      type: "benefit-led",
      hypothesis:
        "Business decision-makers respond best to data-backed ROI claims over emotional appeals",
      primaryMetric: "Lead Form Completion Rate",
    },
    variantB: {
      angle: "Urgency-Led: Peer pressure + deadline (limited seats/spots)",
      type: "urgency-led",
      hypothesis:
        "Scarcity framing targeted at professional identity increases registration intent on LinkedIn",
      primaryMetric: "Cost Per Lead (CPL)",
    },
  },
  Email: {
    variantA: {
      angle: "Benefit-Led: Subject line leads with the #1 outcome",
      type: "benefit-led",
      hypothesis:
        "Benefit-first subject lines achieve higher open rates than curiosity-gap lines for cold audiences",
      primaryMetric: "Open Rate",
    },
    variantB: {
      angle: "Urgency-Led: Subject line with deadline or exclusivity",
      type: "urgency-led",
      hypothesis:
        "Time-bounded subject lines outperform generic lines for click-to-open rate on warm lists",
      primaryMetric: "Click-to-Open Rate (CTOR)",
    },
  },
};

function buildABTestPlan(channels: string[]): ABTestPlanItem[] {
  return channels.map((ch) => {
    const templates = AB_TEST_TEMPLATES[ch as Channel];
    if (!templates) {
      return {
        channel: ch,
        variantA: {
          angle: "Benefit-Led: Lead with primary benefit",
          type: "benefit-led",
          hypothesis: "Benefit messaging outperforms neutral messaging",
          primaryMetric: "Click-Through Rate (CTR)",
        },
        variantB: {
          angle: "Urgency-Led: Time pressure or scarcity",
          type: "urgency-led",
          hypothesis: "Urgency signals increase conversion rate",
          primaryMetric: "Conversion Rate",
        },
      };
    }
    return { channel: ch, ...templates };
  });
}

function computeFitScore(
  budget: number,
  audience: string,
  channels: string[],
  allocation: ChannelAllocation[]
): number {
  const b2b = isB2B(audience);
  const scores = channelScores(b2b, budget);

  // 1. Budget adequacy (0–40 pts)
  //    $100/ch → 10 pts, $500/ch → 25 pts, $1000/ch → 35 pts, $2000+/ch → 40 pts
  const avgPerChannel = channels.length > 0 ? budget / channels.length : 0;
  let budgetScore = 0;
  if (avgPerChannel >= 2000) budgetScore = 40;
  else if (avgPerChannel >= 1000) budgetScore = 35;
  else if (avgPerChannel >= 500) budgetScore = 25;
  else if (avgPerChannel >= 200) budgetScore = 18;
  else if (avgPerChannel >= 100) budgetScore = 10;
  else budgetScore = 5;

  // 2. Audience-channel match (0–40 pts)
  //    Based on average score of selected channels for this audience type
  const maxPossibleScore = 10;
  const avgChannelScore =
    channels.reduce((sum, ch) => sum + (scores[ch as Channel] ?? 5), 0) /
    Math.max(channels.length, 1);
  const audienceScore = Math.round((avgChannelScore / maxPossibleScore) * 40);

  // 3. Channel diversity (0–20 pts)
  //    2 channels → 10 pts, 3 → 14 pts, 4 → 17 pts, 5 → 20 pts
  let diversityScore = 0;
  if (channels.length >= 5) diversityScore = 20;
  else if (channels.length >= 4) diversityScore = 17;
  else if (channels.length >= 3) diversityScore = 14;
  else if (channels.length >= 2) diversityScore = 10;
  else diversityScore = 4;

  return Math.min(100, budgetScore + audienceScore + diversityScore);
}

/**
 * Deterministic risk assessment based on budget adequacy and channel diversity.
 *
 *  HIGH   — avg spend per channel < $200 OR only 1 channel selected
 *           (budget is dangerously thin; limited reach and no fallback channel)
 *  MEDIUM — avg spend per channel < $500 OR ≤2 channels selected
 *           (functional but fragile; under-resourced or over-concentrated)
 *  LOW    — avg spend per channel ≥ $500 AND ≥3 channels selected
 *           (well-funded, diversified, resilient to individual channel underperformance)
 */
function computeRiskLevel(budget: number, channels: string[]): RiskLevel {
  const channelCount = channels.length;
  const avgPerChannel = channelCount > 0 ? budget / channelCount : 0;

  if (avgPerChannel < 200 || channelCount < 2) return "high";
  if (avgPerChannel < 500 || channelCount <= 2) return "medium";
  return "low";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the Smart Logic Layer (Pipeline Step 5).
 *
 * @param productDescription - Campaign product/service description
 * @param audience           - Target audience description
 * @param budget             - Total campaign budget in USD
 * @param aiOutput           - Output from Gemini AI (Step 4); available here
 *                             as context, though channel selection, allocation,
 *                             and scoring remain fully deterministic.
 */
export function runSmartLogic(
  productDescription: string,
  audience: string,
  budget: number,
  aiOutput: AIGenerationOutput
): SmartLogicResult {
  // Step 5a: Channel selection (budget tier + audience type)
  const channels = selectChannels(budget, audience);

  // Step 5b: Budget allocation with min-spend floor ($100 / 10%) + redistribution
  const budgetAllocation = allocateBudget(channels, budget);

  // Step 5c: Recalculate with final channel set (some may have been dropped by floor rule)
  const finalChannels = budgetAllocation.map((a) => a.channel);

  // Step 5d: A/B test variants — benefit-led vs urgency-led per channel
  const abTestPlan = buildABTestPlan(finalChannels);

  // Step 5e: Fit score (0–100) incorporating AI-confirmed channel context
  const fitScore = computeFitScore(budget, audience, finalChannels, budgetAllocation);

  // Step 5f: Risk level — deterministic flag based on budget adequacy + diversity
  const riskLevel = computeRiskLevel(budget, finalChannels);

  return {
    channelMix: finalChannels,
    budgetAllocation,
    abTestPlan,
    fitScore,
    riskLevel,
  };
}

/**
 * Gemini AI Integration (server-side only)
 * Sends: product description, audience, budget, selected channels
 * Receives: campaign ideas, ad copy per channel, messaging angles
 * Retries once on parse failure; marks failed if still broken.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";

export interface CampaignIdea {
  title: string;
  description: string;
  rationale: string;
}

export interface AdCopyItem {
  channel: string;
  headline: string;
  body: string;
  callToAction: string;
}

export interface GeminiOutput {
  campaignIdeas: CampaignIdea[];
  adCopy: AdCopyItem[];
}

function buildPrompt(
  productDescription: string,
  audience: string,
  budget: number,
  channels: string[]
): string {
  return `You are a senior performance marketing strategist. Generate a structured campaign plan in JSON.

Product/Service: ${productDescription}
Target Audience: ${audience}
Budget: $${budget}
Selected Channels: ${channels.join(", ")}

Return ONLY a valid JSON object with this exact structure (no markdown, no code blocks, just raw JSON):
{
  "campaignIdeas": [
    {
      "title": "Campaign concept name",
      "description": "2-3 sentence description of the campaign approach and creative direction",
      "rationale": "Why this concept works for this specific product, audience, and channel mix"
    }
  ],
  "adCopy": [
    {
      "channel": "Channel name exactly as provided",
      "headline": "Attention-grabbing headline (max 60 chars)",
      "body": "Ad body copy (2-3 sentences, persuasive and specific)",
      "callToAction": "CTA text (max 25 chars)"
    }
  ]
}

Requirements:
- Provide exactly 3 campaign ideas. Each should be meaningfully different in approach.
- Provide one ad copy object per channel (${channels.length} total).
- Be specific to the product and audience — no generic filler.
- Do not include any text outside the JSON object.`;
}

function parseGeminiResponse(raw: string): GeminiOutput {
  // Strip markdown code blocks if present
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed.campaignIdeas) || parsed.campaignIdeas.length < 1) {
    throw new Error("Missing or invalid campaignIdeas");
  }
  if (!Array.isArray(parsed.adCopy) || parsed.adCopy.length < 1) {
    throw new Error("Missing or invalid adCopy");
  }

  // Validate structure
  for (const idea of parsed.campaignIdeas) {
    if (!idea.title || !idea.description || !idea.rationale) {
      throw new Error("Campaign idea missing required fields");
    }
  }
  for (const copy of parsed.adCopy) {
    if (!copy.channel || !copy.headline || !copy.body || !copy.callToAction) {
      throw new Error("Ad copy entry missing required fields");
    }
  }

  return {
    campaignIdeas: parsed.campaignIdeas.slice(0, 3),
    adCopy: parsed.adCopy,
  };
}

export async function generateCampaignWithGemini(
  productDescription: string,
  audience: string,
  budget: number,
  channels: string[]
): Promise<{ output: GeminiOutput; rawResponse: string } | { error: string; rawResponse: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.error("GEMINI_API_KEY is not set");
    return { error: "AI service is not configured", rawResponse: "" };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
  const prompt = buildPrompt(productDescription, audience, budget, channels);

  const startTime = Date.now();
  let rawResponse = "";

  // Attempt 1
  try {
    logger.info({ channels }, "Calling Gemini API (attempt 1)");
    const result = await model.generateContent(prompt);
    rawResponse = result.response.text();
    const latency = Date.now() - startTime;
    logger.info({ latency }, "Gemini API call succeeded (attempt 1)");

    const output = parseGeminiResponse(rawResponse);
    return { output, rawResponse };
  } catch (err) {
    const latency = Date.now() - startTime;
    logger.warn({ err, latency }, "Gemini API call failed or parse failed (attempt 1), retrying");
  }

  // Attempt 2 (retry)
  const startTime2 = Date.now();
  try {
    logger.info({ channels }, "Calling Gemini API (attempt 2)");
    const result2 = await model.generateContent(prompt);
    rawResponse = result2.response.text();
    const latency2 = Date.now() - startTime2;
    logger.info({ latency: latency2 }, "Gemini API call succeeded (attempt 2)");

    const output = parseGeminiResponse(rawResponse);
    return { output, rawResponse };
  } catch (err) {
    const latency2 = Date.now() - startTime2;
    logger.error({ err, latency: latency2 }, "Gemini API call failed on retry (attempt 2)");
    return {
      error: "AI generation failed after retry. Please try again later.",
      rawResponse,
    };
  }
}

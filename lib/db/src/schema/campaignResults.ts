import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";

export const campaignResultsTable = pgTable("campaign_results", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id")
    .notNull()
    .references(() => campaignsTable.id),
  channelMix: jsonb("channel_mix"),
  budgetAllocation: jsonb("budget_allocation"),
  aiCampaignIdeas: jsonb("ai_campaign_ideas"),
  aiAdCopy: jsonb("ai_ad_copy"),
  abTestPlan: jsonb("ab_test_plan"),
  fitScore: integer("fit_score"),
  riskLevel: text("risk_level"),
  rawAiResponse: text("raw_ai_response"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCampaignResultSchema = createInsertSchema(
  campaignResultsTable
).omit({ id: true, createdAt: true });
export type InsertCampaignResult = z.infer<typeof insertCampaignResultSchema>;
export type CampaignResult = typeof campaignResultsTable.$inferSelect;

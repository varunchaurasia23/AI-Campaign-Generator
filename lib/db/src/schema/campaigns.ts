import {
  pgTable,
  serial,
  integer,
  text,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { leadsTable } from "./leads";

export const campaignStatusValues = ["processing", "complete", "failed"] as const;
export type CampaignStatus = (typeof campaignStatusValues)[number];

export const campaignsTable = pgTable(
  "campaigns",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leadsTable.id),
    productDescription: text("product_description").notNull(),
    audience: text("audience").notNull(),
    budget: numeric("budget", { precision: 14, scale: 2 }).notNull(),
    status: text("status").notNull().default("processing"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("campaigns_lead_id_idx").on(table.leadId),
    index("campaigns_created_at_idx").on(table.createdAt),
  ]
);

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;

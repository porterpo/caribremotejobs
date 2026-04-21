import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const analyticsEventsTable = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  event: text("event").notNull(),
  jobId: integer("job_id"),
  userId: text("user_id"),
  hasResume: boolean("has_resume"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;

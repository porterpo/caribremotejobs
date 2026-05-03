import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const adminPreferencesTable = pgTable("admin_preferences", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  analyticsDateFrom: text("analytics_date_from"),
  analyticsDateTo: text("analytics_date_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AdminPreference = typeof adminPreferencesTable.$inferSelect;
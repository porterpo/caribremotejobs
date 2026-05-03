import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import crypto from "crypto";

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  categories: text("categories"),
  jobTypes: text("job_types"),
  keywords: text("keywords"),
  token: text("token").notNull().$default(() => crypto.randomUUID()),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true, token: true, createdAt: true, updatedAt: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;

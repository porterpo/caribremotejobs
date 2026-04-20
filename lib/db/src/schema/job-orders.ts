import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jobOrdersTable = pgTable("job_orders", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  productType: text("product_type").notNull(),
  status: text("status").notNull().default("pending"),
  jobsRemaining: integer("jobs_remaining").notNull().default(1),
  jobId: integer("job_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertJobOrderSchema = createInsertSchema(jobOrdersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertJobOrder = z.infer<typeof insertJobOrderSchema>;
export type JobOrder = typeof jobOrdersTable.$inferSelect;

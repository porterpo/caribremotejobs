import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";

export const jobOrdersTable = pgTable("job_orders", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  productType: text("product_type").notNull(),
  status: text("status").notNull().default("pending"),
  jobsRemaining: integer("jobs_remaining").notNull().default(1),
  jobId: integer("job_id").references(() => jobsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type JobOrder = typeof jobOrdersTable.$inferSelect;
export type InsertJobOrder = typeof jobOrdersTable.$inferInsert;

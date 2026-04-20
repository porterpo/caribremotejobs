import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const certificationOrdersTable = pgTable("certification_orders", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  companyName: text("company_name").notNull(),
  stripeSessionId: text("stripe_session_id").notNull().unique(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CertificationOrder = typeof certificationOrdersTable.$inferSelect;
export type InsertCertificationOrder = typeof certificationOrdersTable.$inferInsert;

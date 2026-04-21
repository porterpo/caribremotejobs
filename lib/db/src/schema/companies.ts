import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  logo: text("logo"),
  website: text("website"),
  description: text("description"),
  caribbeanFriendly: boolean("caribbean_friendly").notNull().default(false),
  verifiedEmployer: boolean("verified_employer").notNull().default(false),
  hasViolation: boolean("has_violation").notNull().default(false),
  hiresBahamas: boolean("hires_bahamas").notNull().default(false),
  hiresCaribbean: boolean("hires_caribbean").notNull().default(false),
  country: text("country"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;

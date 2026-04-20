import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  companyId: integer("company_id"),
  companyName: text("company_name").notNull(),
  companyLogo: text("company_logo"),
  caribbeanFriendly: boolean("caribbean_friendly").notNull().default(false),
  entryLevel: boolean("entry_level").notNull().default(false),
  category: text("category").notNull(),
  jobType: text("job_type").notNull().default("full-time"),
  salaryMin: integer("salary_min"),
  salaryMax: integer("salary_max"),
  salaryCurrency: text("salary_currency").notNull().default("USD"),
  description: text("description").notNull(),
  applyUrl: text("apply_url").notNull(),
  source: text("source").notNull().default("manual"),
  sourceJobId: text("source_job_id"),
  locationRestrictions: text("location_restrictions"),
  tags: text("tags"),
  featured: boolean("featured").notNull().default(false),
  approved: boolean("approved").notNull().default(true),
  postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;

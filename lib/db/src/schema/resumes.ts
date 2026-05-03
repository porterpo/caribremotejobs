import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const ExperienceEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  description: z.string(),
});

export const EducationEntrySchema = z.object({
  id: z.string(),
  degree: z.string(),
  institution: z.string(),
  graduationYear: z.string(),
});

export type ExperienceEntry = z.infer<typeof ExperienceEntrySchema>;
export type EducationEntry = z.infer<typeof EducationEntrySchema>;

export const resumesTable = pgTable("resumes", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  summary: text("summary"),
  experience: jsonb("experience").$type<ExperienceEntry[]>().default([]),
  education: jsonb("education").$type<EducationEntry[]>().default([]),
  skills: text("skills").array().default([]),
  uploadedResumePath: text("uploaded_resume_path"),
  shareToken: text("share_token").unique(),
  shareTokenCreatedAt: timestamp("share_token_created_at", { withTimezone: true }),
  shareTokenExpiresAt: timestamp("share_token_expires_at", { withTimezone: true }),
  shareTokenReminderSentAt: timestamp("share_token_reminder_sent_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const ResumeUpsertSchema = z.object({
  summary: z.string().optional(),
  experience: z.array(ExperienceEntrySchema).optional(),
  education: z.array(EducationEntrySchema).optional(),
  skills: z.array(z.string()).optional(),
  uploadedResumePath: z.string().nullable().optional(),
});

export type ResumeUpsert = z.infer<typeof ResumeUpsertSchema>;
export type Resume = typeof resumesTable.$inferSelect;

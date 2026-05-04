ALTER TABLE "job_orders" ADD COLUMN "clerk_user_id" text;
CREATE INDEX IF NOT EXISTS "job_orders_clerk_user_id_idx" ON "job_orders" ("clerk_user_id");

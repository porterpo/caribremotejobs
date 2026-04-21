-- Migration: Remove paid Caribbean Friendly Certification feature
-- Backfill caribbean_friendly = true for all approved jobs
--
-- Context: The paid certification feature was removed. All approved job listings
-- should display the Caribbean Friendly badge automatically. This migration
-- ensures existing approved records are updated to match the new behaviour.
--
-- Schema changes (applied via drizzle-kit push):
--   - companies: dropped caribbean_friendly_certified column
--   - companies: dropped certification_expires_at column
--   - certification_orders table: dropped (schema file removed)
--
-- This script is idempotent — safe to run multiple times.

UPDATE jobs
SET caribbean_friendly = true
WHERE approved = true
  AND caribbean_friendly = false;

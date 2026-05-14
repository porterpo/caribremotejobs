import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { Store, Options, IncrementResponse } from "express-rate-limit";

// Single init promise shared across all store instances so concurrent
// middleware creation never races on CREATE TABLE.
let initPromise: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS rate_limit_counters (
          key TEXT PRIMARY KEY,
          hits INTEGER NOT NULL DEFAULT 1,
          reset_time TIMESTAMPTZ NOT NULL
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS rate_limit_counters_reset_idx
          ON rate_limit_counters (reset_time)
      `);
    } catch (err: unknown) {
      // Tolerate concurrent init from another replica that beat us to it
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("already exists")) throw err;
    }
    // Purge rows whose window closed more than 1 hour ago
    await db.execute(sql`
      DELETE FROM rate_limit_counters
      WHERE reset_time < NOW() - INTERVAL '1 hour'
    `);
  })();
  return initPromise;
}

/**
 * PostgreSQL-backed store for express-rate-limit.
 * Counters survive process restarts and are shared across replicas.
 * Uses an atomic upsert to avoid races between increment and window expiry.
 */
export class PostgresRateLimitStore implements Store {
  private windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  async init(_options: Options): Promise<void> {
    await ensureTable();
  }

  async increment(key: string): Promise<IncrementResponse> {
    const resetTime = new Date(Date.now() + this.windowMs);
    const result = await db.execute(sql`
      INSERT INTO rate_limit_counters (key, hits, reset_time)
      VALUES (${key}, 1, ${resetTime})
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE
          WHEN rate_limit_counters.reset_time <= NOW() THEN 1
          ELSE rate_limit_counters.hits + 1
        END,
        reset_time = CASE
          WHEN rate_limit_counters.reset_time <= NOW() THEN ${resetTime}
          ELSE rate_limit_counters.reset_time
        END
      RETURNING hits, reset_time
    `);
    const row = result.rows[0] as { hits: number; reset_time: Date | string };
    return {
      totalHits: row.hits,
      resetTime: row.reset_time instanceof Date ? row.reset_time : new Date(row.reset_time),
    };
  }

  async decrement(key: string): Promise<void> {
    await db.execute(sql`
      UPDATE rate_limit_counters
      SET hits = GREATEST(0, hits - 1)
      WHERE key = ${key} AND reset_time > NOW()
    `);
  }

  async resetKey(key: string): Promise<void> {
    await db.execute(sql`
      DELETE FROM rate_limit_counters WHERE key = ${key}
    `);
  }

  async resetAll(): Promise<void> {
    await db.execute(sql`DELETE FROM rate_limit_counters`);
  }
}

import cron from "node-cron";
import { logger } from "./logger";
import { runJobSync } from "./sync";

export function startScheduler(): void {
  // Sync jobs every 8 hours: at 06:00, 14:00, and 22:00 UTC
  cron.schedule("0 6,14,22 * * *", async () => {
    logger.info("Scheduled job sync starting");
    try {
      const result = await runJobSync();
      logger.info(result, "Scheduled job sync finished");
    } catch (err) {
      logger.error({ err }, "Scheduled job sync failed");
    }
  });

  logger.info("Job scheduler started — syncing at 06:00, 14:00, 22:00 UTC (3x/day)");
}

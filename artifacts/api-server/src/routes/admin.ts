import { Router, type IRouter } from "express";
import { runJobSync } from "../lib/sync";

const router: IRouter = Router();

router.post("/admin/sync-jobs", async (req, res): Promise<void> => {
  const result = await runJobSync();
  res.json(result);
});

export default router;

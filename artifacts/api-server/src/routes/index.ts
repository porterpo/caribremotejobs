import { Router, type IRouter } from "express";
import healthRouter from "./health";
import jobsRouter from "./jobs";
import companiesRouter from "./companies";
import categoriesRouter from "./categories";
import alertsRouter from "./alerts";
import statsRouter from "./stats";
import adminRouter from "./admin";
import stripeRouter from "./stripe";
import submitRouter from "./submit";
import storageRouter from "./storage";
import profileRouter from "./profile";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(jobsRouter);
router.use(submitRouter);
router.use(companiesRouter);
router.use(categoriesRouter);
router.use(alertsRouter);
router.use(statsRouter);
router.use("/admin", requireAuth);
router.use(adminRouter);
router.use(stripeRouter);
router.use(storageRouter);
router.use(profileRouter);

export default router;

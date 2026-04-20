import { Router, type IRouter } from "express";
import healthRouter from "./health";
import jobsRouter from "./jobs";
import companiesRouter from "./companies";
import categoriesRouter from "./categories";
import alertsRouter from "./alerts";
import statsRouter from "./stats";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(jobsRouter);
router.use(companiesRouter);
router.use(categoriesRouter);
router.use(alertsRouter);
router.use(statsRouter);
router.use(adminRouter);

export default router;

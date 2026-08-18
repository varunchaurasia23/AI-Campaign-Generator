import { Router, type IRouter } from "express";
import healthRouter from "./health";
import campaignsRouter from "./campaigns";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(campaignsRouter);
router.use(adminRouter);

export default router;

import { Router, type IRouter } from "express";
import healthRouter from "./health";
import contractsRouter from "./contracts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(contractsRouter);

export default router;

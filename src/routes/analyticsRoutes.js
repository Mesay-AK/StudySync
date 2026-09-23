import express from "express";
import { getMyAnalytics, getAdminOverview } from "../controllers/analyticsController.js";
import { authenticate, requireAdmin } from "../middleware/authMiddleware.js";

const analyticsRouter = express.Router();

analyticsRouter.get("/me", authenticate, getMyAnalytics);
analyticsRouter.get("/admin/overview", authenticate, requireAdmin, getAdminOverview);

export default analyticsRouter;

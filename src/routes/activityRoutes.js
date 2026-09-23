import express from "express";
import { getMyActivity } from "../controllers/activityController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const activityRouter = express.Router();

activityRouter.get("/", authenticate, getMyActivity);

export default activityRouter;

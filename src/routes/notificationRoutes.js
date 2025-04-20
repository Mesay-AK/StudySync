import express from "express";
import { getNotifications, markAsRead } from "../controllers/notificationController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const notifyRouter = express.Router();

notifyRouter.get("/", authenticate, getNotifications);
notifyRouter.patch("/:id/read", authenticate, markAsRead);

export default notifyRouter;

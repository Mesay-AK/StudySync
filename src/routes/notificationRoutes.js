import express from "express";
import { getNotifications, markAsRead, markAllAsRead } from "../controllers/notificationController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const notifyRouter = express.Router();

notifyRouter.get("/", authenticate, getNotifications);
notifyRouter.patch("/read-all", authenticate, markAllAsRead);
notifyRouter.patch("/:id/read", authenticate, markAsRead);

export default notifyRouter;

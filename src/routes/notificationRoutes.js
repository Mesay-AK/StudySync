import express from "express";
import { getNotifications, markAsRead } from "../controllers/notificationController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const notifyRouter = express.Router();

notifyRouter.get("/", authenticateToken, getNotifications);
notifyRouter.patch("/:id/read", authenticateToken, markAsRead);

export default notifyRouter;

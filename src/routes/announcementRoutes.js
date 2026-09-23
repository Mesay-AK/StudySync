import express from "express";
import {
  getAnnouncements,
  createAnnouncement,
  toggleAnnouncement,
  deleteAnnouncement,
} from "../controllers/announcementController.js";
import { authenticate, requireAdmin } from "../middleware/authMiddleware.js";

const announcementRouter = express.Router();

announcementRouter.use(authenticate);

announcementRouter.get("/", getAnnouncements);
announcementRouter.post("/", requireAdmin, createAnnouncement);
announcementRouter.patch("/:id/toggle", requireAdmin, toggleAnnouncement);
announcementRouter.delete("/:id", requireAdmin, deleteAnnouncement);

export default announcementRouter;

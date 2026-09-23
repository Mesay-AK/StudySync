import express from "express";
import rateLimit from "express-rate-limit";
import { submitContactMessage, getContactMessages, markContactMessageRead } from "../controllers/contactController.js";
import { authenticate, requireAdmin } from "../middleware/authMiddleware.js";

const contactRouter = express.Router();

const contactRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many messages sent. Please try again later." },
});

contactRouter.post("/", contactRateLimiter, submitContactMessage);
contactRouter.get("/", authenticate, requireAdmin, getContactMessages);
contactRouter.patch("/:id/read", authenticate, requireAdmin, markContactMessageRead);

export default contactRouter;

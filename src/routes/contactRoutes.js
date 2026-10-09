import express from "express";
import { createRateLimiter } from "../config/rateLimiter.js";
import { config } from "../config/env.js";
import { submitContactMessage, getContactMessages, markContactMessageRead } from "../controllers/contactController.js";
import { authenticate, requireAdmin } from "../middleware/authMiddleware.js";

const contactRouter = express.Router();

// Redis-backed like the other limiters - the in-memory default only counted
// per process, multiplying the limit by the number of running instances.
const contactRateLimiter = createRateLimiter({
  name: "contact",
  windowMs: config.rateLimits.contact.windowMs,
  limit: config.rateLimits.contact.max,
  message: { message: "Too many messages sent. Please try again later." },
});

contactRouter.post("/", contactRateLimiter, submitContactMessage);
contactRouter.get("/", authenticate, requireAdmin, getContactMessages);
contactRouter.patch("/:id/read", authenticate, requireAdmin, markContactMessageRead);

export default contactRouter;

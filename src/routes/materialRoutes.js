import express from "express";
import rateLimit from "express-rate-limit";
import {
  uploadMaterial,
  getMaterials,
  toggleLike,
  toggleBookmark,
  registerDownload,
  deleteMaterial,
} from "../controllers/materialController.js";
import { authenticate } from "../middleware/authMiddleware.js";
import { materialUploads } from "../middleware/mediaMiddleware.js";

const materialRouter = express.Router();

// Uploads are otherwise size-capped but not frequency-capped - without this,
// an authenticated user can script unlimited uploads and exhaust disk space.
const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many uploads, please try again later." },
});

materialRouter.use(authenticate);

materialRouter.get("/", getMaterials);
materialRouter.post("/", uploadRateLimiter, materialUploads, uploadMaterial);
materialRouter.patch("/:id/like", toggleLike);
materialRouter.patch("/:id/bookmark", toggleBookmark);
materialRouter.post("/:id/download", registerDownload);
materialRouter.delete("/:id", deleteMaterial);

export default materialRouter;

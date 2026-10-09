import express from "express";
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
import { verifyFileContent } from "../middleware/verifyFileContent.js";
import { rejectOperatorKeysInBody } from "../middleware/requestGuards.js";
import { createRateLimiter } from "../config/rateLimiter.js";
import { config } from "../config/env.js";

const materialRouter = express.Router();

// Uploads are otherwise size-capped but not frequency-capped - without this,
// an authenticated user can script unlimited uploads and exhaust disk space.
const uploadRateLimiter = createRateLimiter({
  name: "material-upload",
  windowMs: config.rateLimits.upload.windowMs,
  limit: config.rateLimits.upload.max,
  message: { message: "Too many uploads, please try again later." },
});

materialRouter.use(authenticate);

materialRouter.get("/", getMaterials);
materialRouter.post("/", uploadRateLimiter, materialUploads, rejectOperatorKeysInBody, verifyFileContent, uploadMaterial);
materialRouter.patch("/:id/like", toggleLike);
materialRouter.patch("/:id/bookmark", toggleBookmark);
materialRouter.post("/:id/download", registerDownload);
materialRouter.delete("/:id", deleteMaterial);

export default materialRouter;

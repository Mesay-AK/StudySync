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

const materialRouter = express.Router();

materialRouter.use(authenticate);

materialRouter.get("/", getMaterials);
materialRouter.post("/", materialUploads, uploadMaterial);
materialRouter.patch("/:id/like", toggleLike);
materialRouter.patch("/:id/bookmark", toggleBookmark);
materialRouter.post("/:id/download", registerDownload);
materialRouter.delete("/:id", deleteMaterial);

export default materialRouter;

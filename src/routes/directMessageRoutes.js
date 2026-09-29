import {
        getConversations,
        getDirectMessages,
        searchDirectMessages,
        uploadMedia,
        markAsSeen,
        markConversationAsSeen,
        updateDirectMessage,
        deleteDirectMessage,
        sendDirectMessage,
        getUnreadMessages,
        reportDirectMessage,
 } from "../controllers/directMessageController.js";
import express from "express";
import rateLimit from "express-rate-limit";
import { uploads } from "../middleware/mediaMiddleware.js"
import { authenticate } from "../middleware/authMiddleware.js"

const directMessageRouter = express.Router();

// Uploads are otherwise size-capped but not frequency-capped - without this,
// an authenticated user can script unlimited uploads and exhaust disk space.
const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many uploads, please try again later." },
});

directMessageRouter.use(authenticate);

directMessageRouter.post("/send", sendDirectMessage);
directMessageRouter.get("/conversations", getConversations);
directMessageRouter.get("/unread", getUnreadMessages);
directMessageRouter.post("/upload", uploadRateLimiter, uploads, uploadMedia);
directMessageRouter.post("/report", reportDirectMessage);

directMessageRouter.patch("/:messageId/seen", markAsSeen);
directMessageRouter.patch("/:messageId", updateDirectMessage);
directMessageRouter.delete("/:messageId", deleteDirectMessage);

directMessageRouter.get('/conversation/:senderId/:receiverId', getDirectMessages);
directMessageRouter.get('/conversation/:senderId/:receiverId/search', searchDirectMessages);
directMessageRouter.patch("/conversation/:senderId/seen", markConversationAsSeen);

export default directMessageRouter;
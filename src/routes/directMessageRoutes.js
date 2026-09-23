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
import { uploads } from "../middleware/mediaMiddleware.js"
import { authenticate } from "../middleware/authMiddleware.js"

const directMessageRouter = express.Router();

directMessageRouter.use(authenticate);

directMessageRouter.post("/send", sendDirectMessage);
directMessageRouter.get("/conversations", getConversations);
directMessageRouter.get("/unread", getUnreadMessages);
directMessageRouter.post("/upload", uploads, uploadMedia);
directMessageRouter.post("/report", reportDirectMessage);

directMessageRouter.patch("/:messageId/seen", markAsSeen);
directMessageRouter.patch("/:messageId", updateDirectMessage);
directMessageRouter.delete("/:messageId", deleteDirectMessage);

directMessageRouter.get('/conversation/:senderId/:receiverId', getDirectMessages);
directMessageRouter.get('/conversation/:senderId/:receiverId/search', searchDirectMessages);
directMessageRouter.patch("/conversation/:senderId/seen", markConversationAsSeen);

export default directMessageRouter;
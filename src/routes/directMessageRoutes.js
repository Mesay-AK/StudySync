import {   
        getDirectMessages,
        searchDirectMessages,
        uploadMedia,
        markAsSeen,
        markConversationAsSeen,
        updateDirectMessage,
        deleteDirectMessage,
        sendDirectMessage,
        getUnreadMessages
 } from "../controllers/directMessageController.js";
import express from "express";
import { uploads } from "../middleware/mediaMiddleware.js"

const directMessageRouter = express.Router();

directMessageRouter.post("/send", sendDirectMessage);
directMessageRouter.patch('/direct-messages/:messageId/seen', markAsSeen);
directMessageRouter.patch("/update/:messageId", updateDirectMessage);
directMessageRouter.delete("/delete/:messageId", deleteDirectMessage);
directMessageRouter.get("/search", searchMessages);
directMessageRouter.get("/unread", getUnreadMessages);
directMessageRouter.post("/upload",uploads, uploadMedia);
messageRouter.get('/direct/:senderId/:receiverId', getDirectMessages);
directMessageRouter.get('/direct/:senderId/:receiverId/search', searchDirectMessages);
directMessageRoute.rpatch("/seen/conversation/:senderId", markConversationAsSeen);
directMessageRouter
directMessageRouter


export default directMessageRouter;
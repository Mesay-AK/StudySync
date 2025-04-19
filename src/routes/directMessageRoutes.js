import {sendMessage, 
        getMessages, 
        deleteMessage, 
        markAsSeen, 
        searchMessages, 
        getDirectMessages,
        searchDirectMessages
} from "../../src/controllers/directMessageController.js";
import express from "express";
import { uploads } from "../../src/middleware/multer.js";
import { uploadMedia } from "../../src/controllers/mediaController.js";


const directMessageRouter = express.Router();

directMessageRouter.post("/send", sendMessage);
directMessageRouter.patch("/seen/:messageId", markAsSeen);
directMessageRouter.get("/get/:sender/:receiver", getMessages);
directMessageRouter.delete("/delete/:messageId", deleteMessage);
directMessageRouter.get("/search", searchMessages);
directMessageRouter.post("/upload",uploads, uploadMedia);
messageRouter.get('/direct/:senderId/:receiverId', getDirectMessages);
directMessageRouter.get('/direct/:senderId/:receiverId/search', searchDirectMessages);


export default directMessageRouter;
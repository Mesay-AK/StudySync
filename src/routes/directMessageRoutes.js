import {sendMessage, getMessages, deleteMessage, markAsSeen, searchMessages} from "../../src/controllers/directMessageController.js";
import express from "express";



const directMessageRouter = express.Router();

directMessageRouter.post("/send", sendMessage);
directMessageRouter.patch("/seen/:messageId", markAsSeen);
directMessageRouter.get("/get/:sender/:receiver", getMessages);
directMessageRouter.delete("/delete/:messageId", deleteMessage);
directMessageRouter.get("/search", searchMessages);


export default directMessageRouter;
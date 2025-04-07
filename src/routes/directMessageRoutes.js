import {sendMessage, getMessages, deleteMessage, markAsSeen} from "../../src/controllers/directMessageController.js";
import express from "express";



const router = express.Router();


router.post("/send", sendMessage);
router.patch("/seen/:messageId", markAsSeen);
router.get("/get/:sender/:receiver", getMessages);
router.delete("/delete/:messageId", deleteMessage);
router.get("/search", searchMessages);
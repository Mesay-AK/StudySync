import {SendMessage, GetMessages, DeleteMessage, MarkAsSeen} from "../controllers/directMessageController.js";
import express from "express";



const router = express.Router();


router.post("/send", SendMessage);
router.delete("/delete/:messageId", DeleteMessage);
router.patch("/seen/:messageId", MarkAsSeen);
router.get("/get/:sender/:receiver", GetMessages);
router.delete("/delete/:messageId", DeleteMessage);
router.patch("/seen/:messageId", MarkAsSeen);

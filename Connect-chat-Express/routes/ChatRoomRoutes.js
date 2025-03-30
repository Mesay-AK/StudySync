import express from "express";
import { createRoom, getChatRooms, joinRoom, leaveRoom } from "../controllers/chatRoomController.js";


const router = express.Router();


router.post("/create", createRoom(req, res));
router.get("/", getChatRooms(req, res));
router.post("/join", joinPublicRoom(req, res));
router.post("/leave", leaveRoom(req, res));
router.delete("/:roomId", deleteRoom(req, res));
router.get("/:roomId/messages", getRoomMessages(req, res));  
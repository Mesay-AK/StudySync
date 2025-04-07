import express from "express";
import { createRoom, getChatRooms, joinPublicRoom, leaveRoom, deleteRoom, getRoomMessages } from "../controllers/chatRoomController.js";


const chatRoomRouter = express.Router();


chatRoomRouter.post("/create", createRoom);
chatRoomRouter.get("/all", getChatRooms);  
chatRoomRouter.post("/join", joinPublicRoom);
chatRoomRouter.post("/leave", leaveRoom);
chatRoomRouter.delete("/delete/:roomId", deleteRoom);
chatRoomRouter.get("/messages/:roomId", getRoomMessages);


export default chatRoomRouter;
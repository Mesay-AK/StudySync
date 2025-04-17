import express from "express";
import {
  createRoom,
  getAllPublicRooms,
  joinPublicRoom,
  joinPrivateRoom,
  inviteUsers,
  leaveRoom,
  deleteRoom,
  getRoomMessages,
  searchRoomMessages
} from "../controllers/chatRoomController.js";

const chatRoomRoutes = express.Router();

chatRoomRoutes.get("/all", getAllPublicRooms);
chatRoomRoutes.post("/create", createRoom);
chatRoomRoutes.post("/join-public", joinPublicRoom);
chatRoomRoutes.post("/join-private/:roomId", joinPrivateRoom);
chatRoomRoutes.post("/invite/:roomId", inviteUsers);
chatRoomRoutes.post("/leave", leaveRoom);
chatRoomRoutes.delete("/delete/:roomId", deleteRoom);
chatRoomRoutes.get("/messages/:roomId", getRoomMessages);
chatRoomRoutes.get('/room/:roomId/search', searchRoomMessages);


export default chatRoomRoutes;

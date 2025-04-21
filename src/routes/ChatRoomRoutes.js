import express from "express";
import {
  getAllPublicRooms,
  createRoom,
  joinPrivateRoom,
  joinPublicRoom,
  inviteUsers,
  sendMessageToRoom,
  getRoomMessages,
  searchRoomMessages,
  updateDMessage,
  deleteMessage,
  deleteRoom,
  leaveRoom,
  reportUser,
  reportMessage,
} from "../controllers/chatRoomController.js";

import {checkOwnershipOrAdmin,authenticate} from "../middleware/authMiddleware.js"

const chatRoomRoutes = express.Router();


chatRoomRoutes.post("/send", sendMessageToRoom);
chatRoomRoutes.get("/all", getAllPublicRooms);
chatRoomRoutes.post("/create", createRoom);
chatRoomRoutes.post("/join-public", joinPublicRoom);
chatRoomRoutes.post("/join-private/:roomId", joinPrivateRoom);
chatRoomRoutes.post("/invite/:roomId", inviteUsers);
chatRoomRoutes.post("/leave", leaveRoom);
chatRoomRoutes.delete("/delete/:roomId", deleteRoom);
chatRoomRoutes.patch("/update/:messageId", updateDMessage);
chatRoomRoutes.delete("/deleteMessage/:messageId", deleteMessage);
chatRoomRoutes.get("/messages/:roomId", getRoomMessages);
chatRoomRoutes.get('/room/:roomId/search', searchRoomMessages);
chatRoomRoutes.post("/reportMessage", authenticate, checkOwnershipOrAdmin, reportMessage);
chatRoomRoutes.post("/reportUser", authenticate, checkOwnershipOrAdmin, reportUser);



export default chatRoomRoutes;

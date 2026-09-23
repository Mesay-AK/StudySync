import express from "express";
import {
  getAllPublicRooms,
  getMyRooms,
  getAllRoomsAdmin,
  getRoomById,
  createRoom,
  joinPrivateRoom,
  joinPublicRoom,
  inviteUsers,
  sendMessageToRoom,
  getRoomMessages,
  searchRoomMessages,
  updateRoomMessage,
  deleteMessage,
  deleteRoom,
  leaveRoom,
  reportUser,
  reportMessage,
} from "../controllers/chatRoomController.js";

import { authenticate, requireAdmin } from "../middleware/authMiddleware.js"

const chatRoomRoutes = express.Router();

chatRoomRoutes.get("/all", getAllPublicRooms);

chatRoomRoutes.use(authenticate);

chatRoomRoutes.get("/mine", getMyRooms);
chatRoomRoutes.get("/admin/all", requireAdmin, getAllRoomsAdmin);
chatRoomRoutes.post("/create", createRoom);
chatRoomRoutes.post("/join-public/:roomId", joinPublicRoom);
chatRoomRoutes.post("/join-private/:roomId", joinPrivateRoom);
chatRoomRoutes.post("/invite/:roomId", inviteUsers);
chatRoomRoutes.post("/leave", leaveRoom);
chatRoomRoutes.delete("/delete/:roomId", deleteRoom);

chatRoomRoutes.post("/:roomId/send", sendMessageToRoom);
chatRoomRoutes.get("/:roomId/messages", getRoomMessages);
chatRoomRoutes.get("/:roomId/search", searchRoomMessages);
chatRoomRoutes.patch("/messages/:messageId", updateRoomMessage);
chatRoomRoutes.delete("/:roomId/messages/:messageId", deleteMessage);
chatRoomRoutes.get("/:roomId", getRoomById);

chatRoomRoutes.post("/report/message", reportMessage);
chatRoomRoutes.post("/report/user", reportUser);

export default chatRoomRoutes;

import { Server } from "socket.io";
import { socketAuthMiddleware } from "../middleware/socketAuthMiddleware.js";
import { handleUserConnection } from "../utils/socketHandlers/userHandlers.js";
import { handleDirectMessages } from "../utils/socketHandlers/directMessageHandler.js";
import { handleMessages } from "../utils/socketHandlers/messageHandler.js";
import { handleChatRooms } from "../utils/socketHandlers/chatRoomHandler.js";
import { handleTypingIndicators } from "../utils/socketHandlers/typingHandlers.js";

const setupSocket = (server) => {
  const io = new Server(server, {
    cors: { origin: process.env.FRONTEND_URL, credentials: true },
  });

  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
    console.log(`User ${socket.userId} connected with socket ${socket.id}`);

    handleUserConnection(socket, io);
    handleDirectMessages(socket, io);
    handleChatRooms(socket, io);
    handleMessages(socket, io);
    handleTypingIndicators(socket, io);
  });

  return io;
};

export default setupSocket;

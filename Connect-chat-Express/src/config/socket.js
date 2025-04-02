import { Server } from "socket.io";
import { handleUserConnection } from "../socketHandlers/userHandler.js";
import { handleDirectMessages } from "../socketHandlers/directMessageHandler.js";
import { handleChatRooms } from "../socketHandlers/chatRoomHandler.js";
import { handleMessages } from "../socketHandlers/messageHandler.js";

const setupSocket = (server) => {
  const io = new Server(server, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    console.log(`User Connected: ${socket.id}`);

    handleUserConnection(socket);
    handleDirectMessages(socket, io);
    handleChatRooms(socket);
    handleMessages(socket, io);
  });

  return io;
};

export default setupSocket;

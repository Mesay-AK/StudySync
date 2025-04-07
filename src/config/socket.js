import { Server } from "socket.io";
import { handleUserConnection } from "../utils/socketHandlers/userHandlers.js";
import { handleDirectMessages } from "../utils/socketHandlers/directMessageHandler.js";
import { handleMessages } from "../utils/socketHandlers/messageHandler.js";
import { handleChatRooms } from "../utils/socketHandlers/chatRoomHandler.js";


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

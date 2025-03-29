import { Server } from "socket.io";
import Message from "../models/Message.js";

const usersOnline = new Map();

const setupSocket = (server) => {
  const io = new Server(server, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on("userConnected", (userId) => {
      usersOnline.set(socket.id, userId);
      console.log(`User ${userId} connected with socket ${socket.id}`);
    });

    socket.on("sendMessage", async ({ sender, receiver, content, messageType }) => {
      if (!sender || !receiver || !content) return;

      const newMessage = new Message({ sender, receiver, content, messageType });
      await newMessage.save();

      const receiverSocketId = [...usersOnline.entries()].find(([, id]) => id === receiver)?.[0];

      if (receiverSocketId) {
        io.to(receiverSocketId).emit("receiveMessage", newMessage);
      }
    });

    socket.on("disconnect", () => {
      usersOnline.delete(socket.id);
      console.log(`User Disconnected: ${socket.id}`);
    });
  });

  return io;
};

export default setupSocket;

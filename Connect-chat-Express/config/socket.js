import { Server } from "socket.io";
import Message from "../models/Message.js";
import ChatRoom from "../models/ChatRoom.js"; 

const usersOnline = new Map();

const setupSocket = (server) => {
  const io = new Server(server, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on("userConnected", (userId) => {
      usersOnline.set(socket.id, userId);
      console.log(`User ${userId} connected with socket ${socket.id}`);
    });

    socket.on("joinPublicRoom", async ({ userId, roomId }) => {
      const room = await ChatRoom.findById(roomId);

      if (!room) {
        console.error(`Public room ${roomId} not found`);
        return;
      }
      if (room.type !== "public") return;

      if (!room.members.includes(userId)) {
        room.members.push(userId);
        await room.save();
      }

      socket.join(roomId);
      console.log(`User ${userId} joined public room ${roomId}`);
    });

    socket.on("joinPrivateRoom", async ({ userId, roomId }) => {
      const room = await ChatRoom.findById(roomId);

      if (!room) {
        console.error(`Private room ${roomId} not found`);
        return;
      }
      if (room.type !== "private") return;
      if (!room.invitedUsers.includes(userId) && !room.members.includes(userId)) return;

      socket.join(roomId);
      console.log(`User ${userId} joined private room ${roomId}`);
    });

    socket.on("sendPrivateMessage", async ({ sender, roomId, content }) => {
      const room = await ChatRoom.findById(roomId);
      if (!room || !room.members.includes(sender)) return;

      const newMessage = new Message({ sender, chatRoomId: roomId, content });
      await newMessage.save();

      io.to(roomId).emit("receiveMessage", newMessage);
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
      const userId = usersOnline.get(socket.id);
      usersOnline.delete(socket.id);
      console.log(`User ${userId} Disconnected`);
    });
  });

  return io;
};

export default setupSocket;

import ChatRoom from "../../models/ChatRoom.js";
import Message from "../../models/Message.js";
import User from "../../models/User.js";
import { Server } from "socket.io";

/**
 * Handles real-time room interactions via sockets.
 * @param {Socket} socket - The connected socket instance.
 * @param {Server} io - The Socket.IO server instance.
 */
const handleChatRooms = (socket, io) => {

  socket.on("joinRoom", async ({ userId, roomId }) => {
    try {
      const room = await ChatRoom.findById(roomId);
      if (!room || room.isDeleted) return;

      const senderUser = await User.findById(userId);
      if (!senderUser || senderUser.isBanned) {
        return socket.emit("banned", {
          message: "You are currently banned. Please contact support.",
        });
      }

      const alreadyMember = room.members.includes(userId);
      const isAllowed =
        room.type === "public" ||
        (room.type === "private" && room.invitedUsers.includes(userId));

      if (isAllowed && !alreadyMember) {
        room.members.push(userId);
        await room.save();
      }

      if (isAllowed) {
        socket.join(roomId);
        socket.to(roomId).emit("userJoined", { userId, roomId });

        const messages = await Message.find({ chatRoomId: roomId })
          .sort({ createdAt: -1 })
          .limit(20)
          .select("sender content createdAt");

        socket.emit("previousMessages", messages);
      } else {
        socket.emit("unauthorized", { message: "Access to room denied" });
      }
    } catch (error) {
      console.error("joinRoom error:", error);
      socket.emit("error", { message: "Failed to join room" });
    }
  });

  socket.on("getRoomParticipants", async (roomId, callback) => {
    try {
      const sockets = await io.in(roomId).fetchSockets();
      const participantIds = sockets.map((s) => s.userId).filter(Boolean);

      const participants = await User.find({ _id: { $in: participantIds } })
        .select("username profilePicture");

      callback({ success: true, participants });
    } catch (err) {
      console.error("Error fetching participants:", err);
      callback({ success: false, message: "Error fetching participants" });
    }
  });

  socket.on("leaveRoom", async ({ userId, roomId }) => {
    try {
      const room = await ChatRoom.findById(roomId);
      if (!room) return;

      room.members = room.members.filter((id) => id.toString() !== userId);
      await room.save();

      socket.leave(roomId);
      socket.to(roomId).emit("userLeft", { userId, roomId });
    } catch (error) {
      console.error("leaveRoom error:", error);
      socket.emit("error", { message: "Failed to leave room" });
    }
  });

};

export { handleChatRooms };

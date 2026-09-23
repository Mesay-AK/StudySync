import ChatRoom from "../../models/ChatRoom.js";
import Message from "../../models/Message.js";
import User from "../../models/User.js";
import RoomSession from "../../models/RoomSession.js";
import { logActivity } from "../../utils/activityLogger.js";

const closeSession = async (sessionId) => {
  const session = await RoomSession.findById(sessionId);
  if (!session || session.leftAt) return;

  session.leftAt = new Date();
  session.durationSeconds = Math.round((session.leftAt - session.joinedAt) / 1000);
  await session.save();
};

/**
 * Handles real-time room interactions via sockets.
 * @param {Socket} socket - The connected, authenticated socket instance.
 * @param {Server} io - The Socket.IO server instance.
 */
const handleChatRooms = (socket, io) => {
  const userId = socket.userId;
  // Tracks sessions THIS socket opened, so a disconnect only closes the
  // rooms this tab/connection was actually in - not the user's other tabs.
  const openSessionsByRoom = new Map();

  socket.on("joinRoom", async ({ roomId }) => {
    try {
      const room = await ChatRoom.findById(roomId);
      if (!room || room.isDeleted) return;

      const alreadyMember = room.members.includes(userId);
      const isAllowed =
        room.type === "public" ||
        (room.type === "private" && room.invitedUsers.includes(userId));

      if (!isAllowed) {
        return socket.emit("unauthorized", { message: "Access to room denied" });
      }

      if (!alreadyMember) {
        room.members.push(userId);
        await room.save();
        await logActivity({
          user: userId,
          type: "room_joined",
          description: `Joined the study room "${room.name}"`,
          metadata: { roomId: room._id },
        });
      }

      socket.join(roomId);
      socket.to(roomId).emit("userJoined", { userId, roomId });

      const session = await RoomSession.create({ user: userId, room: roomId, joinedAt: new Date() });
      openSessionsByRoom.set(roomId, session._id);

      const messages = await Message.find({ chatRoomId: roomId, isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(20)
        .select("sender content createdAt");

      socket.emit("previousMessages", messages);
    } catch (error) {
      console.error("joinRoom error:", error);
      socket.emit("error", { message: "Failed to join room" });
    }
  });

  socket.on("getRoomParticipants", async (roomId, callback) => {
    try {
      const sockets = await io.in(roomId).fetchSockets();
      const participantIds = [...new Set(sockets.map((s) => s.userId).filter(Boolean))];

      const participants = await User.find({ _id: { $in: participantIds } })
        .select("username profilePicture");

      callback({ success: true, participants });
    } catch (err) {
      console.error("Error fetching participants:", err);
      callback({ success: false, message: "Error fetching participants" });
    }
  });

  socket.on("leaveRoom", async ({ roomId }) => {
    try {
      const room = await ChatRoom.findById(roomId);
      if (!room) return;

      room.members = room.members.filter((id) => id.toString() !== userId);
      await room.save();

      socket.leave(roomId);
      socket.to(roomId).emit("userLeft", { userId, roomId });

      const sessionId = openSessionsByRoom.get(roomId);
      if (sessionId) {
        await closeSession(sessionId);
        openSessionsByRoom.delete(roomId);
      }
    } catch (error) {
      console.error("leaveRoom error:", error);
      socket.emit("error", { message: "Failed to leave room" });
    }
  });

  socket.on("disconnect", async () => {
    for (const sessionId of openSessionsByRoom.values()) {
      await closeSession(sessionId).catch((err) => console.error("Error closing room session:", err.message));
    }
    openSessionsByRoom.clear();
  });
};

export { handleChatRooms };

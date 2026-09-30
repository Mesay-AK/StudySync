import ChatRoom from "../../models/ChatRoom.js";
import Message from "../../models/Message.js";
import User from "../../models/User.js";
import RoomSession from "../../models/RoomSession.js";
import { logActivity } from "../../utils/activityLogger.js";
import logger from "../logger.js";

const closeSession = async (sessionId) => {
  const session = await RoomSession.findById(sessionId);
  if (!session || session.leftAt) return;

  session.leftAt = new Date();
  session.durationSeconds = Math.round((session.leftAt - session.joinedAt) / 1000);
  await session.save();
};

// A brief network blip triggers a socket disconnect + reconnect + client
// rejoin-all-rooms, which would otherwise close one RoomSession and
// immediately open another - polluting "real study time" analytics with
// phantom short sessions. If this user's session for this room was closed
// moments ago, reopen it instead of starting a new one. Only ever matches a
// session that's already closed (leftAt set), so this can't collide with a
// genuinely concurrent session from another tab.
const RECONNECT_GRACE_MS = 30 * 1000;

const reopenOrCreateSession = async (userId, roomId) => {
  const recentlyClosed = await RoomSession.findOne({
    user: userId,
    room: roomId,
    leftAt: { $gte: new Date(Date.now() - RECONNECT_GRACE_MS) },
  }).sort({ leftAt: -1 });

  if (recentlyClosed) {
    recentlyClosed.leftAt = null;
    recentlyClosed.durationSeconds = 0;
    await recentlyClosed.save();
    return recentlyClosed;
  }

  return RoomSession.create({ user: userId, room: roomId, joinedAt: new Date() });
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
      if (!room || room.isDeleted) {
        return socket.emit("error", { message: "This room no longer exists." });
      }

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

      const session = await reopenOrCreateSession(userId, roomId);
      openSessionsByRoom.set(roomId, session._id);

      const messages = await Message.find({ chatRoomId: roomId, isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(20)
        .select("sender content media messageType createdAt")
        .populate("sender", "username displayName");

      socket.emit("previousMessages", messages);
    } catch (error) {
      logger.error({ err: error, userId, roomId }, "joinRoom error");
      socket.emit("error", { message: "Failed to join room" });
    }
  });

  // Fired when the client navigates away from a room's view (not a real
  // "Leave Room" action) - stops this socket receiving further broadcasts
  // for the room and closes session-time tracking, without touching
  // room.members. Deliberately separate from "leaveRoom" below, which is a
  // real, membership-removing leave.
  socket.on("exitRoomView", async ({ roomId }) => {
    try {
      socket.leave(roomId);

      const sessionId = openSessionsByRoom.get(roomId);
      if (sessionId) {
        await closeSession(sessionId);
        openSessionsByRoom.delete(roomId);
      }
    } catch (error) {
      logger.error({ err: error, userId, roomId }, "exitRoomView error");
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
      logger.error({ err, userId, roomId }, "Error fetching participants");
      callback({ success: false, message: "Error fetching participants" });
    }
  });

  socket.on("leaveRoom", async ({ roomId }) => {
    try {
      const room = await ChatRoom.findById(roomId);
      if (!room) {
        return socket.emit("error", { message: "This room no longer exists." });
      }

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
      logger.error({ err: error, userId, roomId }, "leaveRoom error");
      socket.emit("error", { message: "Failed to leave room" });
    }
  });

  socket.on("disconnect", async () => {
    for (const sessionId of openSessionsByRoom.values()) {
      await closeSession(sessionId).catch((err) => logger.error({ err, userId, sessionId }, "Error closing room session"));
    }
    openSessionsByRoom.clear();
  });
};

export { handleChatRooms };

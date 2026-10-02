import ChatRoom from "../../models/ChatRoom.js";
import Message from "../../models/Message.js";
import User from "../../models/User.js";
import RoomSession from "../../models/RoomSession.js";
import { logActivity } from "../../utils/activityLogger.js";
import { joinRoomAtomically, leaveRoomAtomically } from "../roomMembership.js";
import { safeOn, payloadOf } from "./safeOn.js";
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

  safeOn(socket, "joinRoom", async (payload) => {
    const { roomId } = payloadOf(payload);
    try {
      const room = await ChatRoom.findById(roomId);
      if (!room || room.isDeleted) {
        return socket.emit("error", { message: "This room no longer exists." });
      }
      const roomKey = room._id.toString();

      const alreadyMember = room.members.some((m) => m.toString() === userId);
      if (!alreadyMember) {
        // Existing members (including a private room's creator, who is never
        // in invitedUsers) always get in; new members need a public room or
        // an invite - and, like the REST join, a free seat.
        const access =
          room.type === "public" ? { type: "public" }
          : room.invitedUsers.some((id) => id.toString() === userId) ? { type: "private", invitedUsers: userId }
          : null;
        if (!access) {
          return socket.emit("unauthorized", { message: "Access to room denied" });
        }

        const result = await joinRoomAtomically(room._id, userId, access);
        if (result.status === "full") return socket.emit("error", { message: "This room is full." });
        if (result.status === "not_found") return socket.emit("unauthorized", { message: "Access to room denied" });
        if (result.status === "joined") {
          await logActivity({
            user: userId,
            type: "room_joined",
            description: `Joined the study room "${room.name}"`,
            metadata: { roomId: room._id },
          });
        }
      }

      socket.join(roomKey);
      socket.to(roomKey).emit("userJoined", { userId, roomId: roomKey });

      // A second joinRoom on the same socket (re-render, StrictMode double
      // effect) used to open a second session and orphan the first, which
      // then counted as "still studying" forever.
      if (!openSessionsByRoom.has(roomKey)) {
        const session = await reopenOrCreateSession(userId, room._id);
        openSessionsByRoom.set(roomKey, session._id);
      }

      const viewer = await User.findById(userId).select("blockedUsers");
      const messages = await Message.find({
        chatRoomId: room._id,
        isDeleted: false,
        sender: { $nin: viewer?.blockedUsers || [] },
      })
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
  safeOn(socket, "exitRoomView", async (payload) => {
    const { roomId } = payloadOf(payload);
    if (typeof roomId !== "string") return;
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

  safeOn(socket, "getRoomParticipants", async (roomId, callback) => {
    const reply = typeof callback === "function" ? callback : () => {};
    try {
      // Only people who could see the room may see who's in it - this used to
      // answer for any room id, including private rooms the caller wasn't in.
      const room = await ChatRoom.findById(roomId);
      const canView =
        room && !room.isDeleted &&
        (room.members.some((m) => m.toString() === userId) || socket.user?.isAdmin);
      if (!canView) return reply({ success: false, message: "Room not found" });

      const sockets = await io.in(room._id.toString()).fetchSockets();
      const participantIds = [...new Set(sockets.map((s) => s.userId).filter(Boolean))];

      const participants = await User.find({ _id: { $in: participantIds } })
        .select("username profilePicture");

      reply({ success: true, participants });
    } catch (err) {
      logger.error({ err, userId, roomId }, "Error fetching participants");
      reply({ success: false, message: "Error fetching participants" });
    }
  });

  safeOn(socket, "leaveRoom", async (payload) => {
    const { roomId } = payloadOf(payload);
    try {
      const room = await ChatRoom.findById(roomId);
      if (!room) {
        return socket.emit("error", { message: "This room no longer exists." });
      }
      const roomKey = room._id.toString();

      // Same atomic leave as the REST endpoint: drops admin rights too (they
      // used to survive a socket leave) and hands admin to another member if
      // this was the last one.
      await leaveRoomAtomically(room._id, userId);

      socket.leave(roomKey);
      socket.to(roomKey).emit("userLeft", { userId, roomId: roomKey });

      const sessionId = openSessionsByRoom.get(roomKey);
      if (sessionId) {
        await closeSession(sessionId);
        openSessionsByRoom.delete(roomKey);
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

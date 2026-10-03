import Message from "../../models/Message.js";
import ChatRoom from "../../models/ChatRoom.js";
import DirectMessage from "../../models/DirectMessage.js";
import Notification from "../../models/Notification.js";
import mongoose from "mongoose";
import emojiRegex from "emoji-regex";
import User from "../../models/User.js";
import { clampPagination } from "../pagination.js";
import { normalizeMedia } from "../mediaValidation.js";
import { safeOn, payloadOf } from "./safeOn.js";
import logger from "../logger.js";

// One notification per message per member flooded everyone's list in busy
// rooms. Instead:
//   - members currently viewing the room get none (they see it live);
//   - everyone else has ONE unread notification per room, updated in place
//     ("3 new messages") and moved to the top, until they read it.
const notifyRoomMembers = async ({ io, room, sender, content, recipientIds }) => {
  const roomId = room._id.toString();
  const viewers = new Set((await io.in(roomId).fetchSockets()).map((s) => s.userId));
  const targets = recipientIds.filter((id) => !viewers.has(id.toString()));
  if (targets.length === 0) return;

  const now = new Date();
  const ops = targets.map((recipient) => ({
    updateOne: {
      filter: { recipient, type: "room_message", isRead: false, "metadata.roomId": roomId },
      update: {
        $set: { sender: new mongoose.Types.ObjectId(sender), content, "metadata.roomName": room.name, updatedAt: now },
        $inc: { "metadata.count": 1 },
        $setOnInsert: { createdAt: now, __v: 0 },
      },
      upsert: true,
    },
  }));

  try {
    await Notification.collection.bulkWrite(ops, { ordered: false });
  } catch (err) {
    // Two messages racing to create the same room's first notification: the
    // unique index rejects one insert - retrying turns it into an update.
    if (err?.code !== 11000 && !err?.writeErrors?.every((e) => e.code === 11000)) throw err;
    await Notification.collection.bulkWrite(ops, { ordered: false });
  }

  const notifications = await Notification.find({
    recipient: { $in: targets }, type: "room_message", isRead: false, "metadata.roomId": roomId,
  });
  for (const notification of notifications) {
    io.to(notification.recipient.toString()).emit("newNotification", notification);
  }
};

export const handleMessages = (socket, io) => {
  const sender = socket.userId;

  safeOn(socket, "sendPrivateMessage", async (payload) => {
    const { roomId, content, media } = payloadOf(payload);
    try {
      if (content !== undefined && content !== null && typeof content !== "string") {
        return socket.emit("error", { message: "Invalid message data." });
      }
      const normalized = normalizeMedia(media);
      if (normalized.error) return socket.emit("error", { message: normalized.error });
      if (!roomId || (!content?.trim() && !normalized.media)) {
        return socket.emit("error", { message: "Invalid message data." });
      }

      const room = await ChatRoom.findById(roomId);
      if (!room || room.isDeleted) {
        return socket.emit("error", { message: "This room no longer exists." });
      }

      if (!room.members.some((memberId) => memberId.toString() === sender)) {
        return socket.emit("error", { message: "You are not a member of this room." });
      }

      const emojiMatches = content ? [...content.matchAll(emojiRegex())].map(match => match[0]) : [];

      const newMessage = new Message({
        sender,
        chatRoomId: room._id,
        content: content || "",
        status: "delivered",
        emojis: emojiMatches,
      });
      if (normalized.media) {
        newMessage.media = normalized.media;
        newMessage.messageType = normalized.media.type;
      }

      await newMessage.save();
      await newMessage.populate("sender", "username displayName");

      // The broadcast below intentionally skips the sender (they don't
      // need a notification for their own message) - echo it back to their
      // own per-user room so every tab/device they're connected from sees it.
      io.to(sender).emit("receiveMessage", newMessage);

      // One query for every recipient (members who haven't blocked the
      // sender), instead of ~3 sequential lookups per member per message.
      const [senderUser, recipients] = await Promise.all([
        User.findById(sender).select("blockedUsers"),
        User.find({ _id: { $in: room.members, $ne: sender }, blockedUsers: { $ne: sender } }).select("_id"),
      ]);
      const senderBlocked = new Set((senderUser?.blockedUsers || []).map(String));

      for (const recipient of recipients) {
        // Emitting to the per-user room (joined in userHandlers.js on
        // connect) reaches every socket that user has open, not just
        // whichever one happened to connect first.
        io.to(recipient._id.toString()).emit("receiveMessage", newMessage);
      }

      await notifyRoomMembers({
        io,
        room,
        sender,
        content: content || "",
        // Same rule as createAndSendNotification: no notification if either
        // side has blocked the other.
        recipientIds: recipients.filter((r) => !senderBlocked.has(r._id.toString())).map((r) => r._id),
      });
    } catch (err) {
      logger.error({ err, sender, roomId }, "sendPrivateMessage error");
      socket.emit("error", { message: "Failed to send message." });
    }
  });

  safeOn(socket, "getRoomMessages", async (payload) => {
    const { roomId, page = 1, limit = 20 } = payloadOf(payload);
    try {
      const room = await ChatRoom.findById(roomId);
      if (!room || room.isDeleted) return socket.emit("error", { message: "Room not found." });
      if (!room.members.some((memberId) => memberId.toString() === sender)) {
        return socket.emit("error", { message: "You are not a member of this room." });
      }

      const user = await User.findById(sender);
      const blockedUsers = user.blockedUsers;
      const { limit: safeLimit, skip } = clampPagination(page, limit);
      const messages = await Message.find({
        chatRoomId: room._id,
        sender: { $nin: blockedUsers },
        isDeleted: false,
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .populate("sender", "username displayName");

      socket.emit("roomMessages", messages);
    } catch (err) {
      logger.error({ err, sender, roomId }, "getRoomMessages error");
      socket.emit("error", { message: "Failed to retrieve messages." });
    }
  });

  safeOn(socket, "getDirectMessages", async (payload) => {
    const { receiverId, page = 1, limit = 20 } = payloadOf(payload);
    try {
      const receiver = await User.findById(receiverId);
      if (!receiver) return socket.emit("error", { message: "User not found." });

      const senderUser = await User.findById(sender);
      const blockedUsers = senderUser.blockedUsers;

      const { limit: safeLimit, skip } = clampPagination(page, limit);
      const messages = await DirectMessage.find({
        $or: [
          { sender, receiver: receiver._id },
          { sender: receiver._id, receiver: sender },
        ],
        sender: { $nin: blockedUsers },
        isDeleted: false,
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit);

      socket.emit("directMessages", messages);
    } catch (err) {
      logger.error({ err, sender, receiverId }, "getDirectMessages error");
      socket.emit("error", { message: "Failed to retrieve direct messages." });
    }
  });
};

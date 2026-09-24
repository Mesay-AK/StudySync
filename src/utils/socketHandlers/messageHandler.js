import Message from "../../models/Message.js";
import ChatRoom from "../../models/ChatRoom.js";
import DirectMessage from "../../models/DirectMessage.js";
import { createAndSendNotification } from "./notificationHandlers.js";
import emojiRegex from "emoji-regex";
import User from "../../models/User.js";
import { usersOnline } from "./userHandlers.js";

export const handleMessages = (socket, io) => {
  const sender = socket.userId;

  socket.on("sendPrivateMessage", async ({ roomId, content, media }) => {
    try {
      if (!roomId || (!content?.trim() && !media)) {
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
        chatRoomId: roomId,
        content: content || "",
        status: "delivered",
        emojis: emojiMatches,
      });
      if (media) {
        newMessage.media = media;
        newMessage.messageType = media.type || "file";
      }

      await newMessage.save();
      await newMessage.populate("sender", "username displayName");

      // The broadcast loop below intentionally skips the sender (they don't
      // need a notification for their own message) - echo it back to their
      // own socket directly so their chat panel actually shows what they sent.
      const senderSocketId = [...usersOnline.entries()].find(([, id]) => id === sender)?.[0];
      if (senderSocketId) {
        io.to(senderSocketId).emit("receiveMessage", newMessage);
      }

      // Notify all members who haven't blocked the sender.
      for (const memberId of room.members) {
        if (memberId.toString() === sender) continue;

        const memberUser = await User.findById(memberId);
        if (memberUser?.blockedUsers.includes(sender)) continue;

        const socketId = [...usersOnline.entries()].find(([, id]) => id === memberId.toString())?.[0];
        if (socketId) {
          io.to(socketId).emit("receiveMessage", newMessage);
        }

        await createAndSendNotification({
          io,
          type: "room_message",
          recipientId: memberId.toString(),
          senderId: sender,
          content,
          metadata: { roomId },
        });
      }
    } catch (err) {
      console.error("sendPrivateMessage error:", err.message);
      socket.emit("error", { message: "Failed to send message." });
    }
  });

  socket.on("getRoomMessages", async ({ roomId, page = 1, limit = 20 }) => {
    try {
      const room = await ChatRoom.findById(roomId);
      if (!room) return socket.emit("error", { message: "Room not found." });
      if (!room.members.some((memberId) => memberId.toString() === sender)) {
        return socket.emit("error", { message: "You are not a member of this room." });
      }

      const user = await User.findById(sender);
      const blockedUsers = user.blockedUsers;
      const messages = await Message.find({
        chatRoomId: roomId,
        sender: { $nin: blockedUsers },
        isDeleted: false,
      })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("sender", "username displayName");

      socket.emit("roomMessages", messages);
    } catch (err) {
      console.error("getRoomMessages error:", err.message);
      socket.emit("error", { message: "Failed to retrieve messages." });
    }
  });

  socket.on("getDirectMessages", async ({ receiverId, page = 1, limit = 20 }) => {
    try {
      const receiver = await User.findById(receiverId);
      if (!receiver) return socket.emit("error", { message: "User not found." });

      const senderUser = await User.findById(sender);
      const blockedUsers = senderUser.blockedUsers;

      const messages = await DirectMessage.find({
        $or: [
          { sender, receiver: receiverId },
          { sender: receiverId, receiver: sender },
        ],
        sender: { $nin: blockedUsers },
        isDeleted: false,
      })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      socket.emit("directMessages", messages);
    } catch (err) {
      console.error("getDirectMessages error:", err.message);
      socket.emit("error", { message: "Failed to retrieve direct messages." });
    }
  });
};

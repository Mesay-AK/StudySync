import Message from "../../models/Message.js";
import ChatRoom from "../../models/ChatRoom.js";
import { createAndSendNotification } from "../../utils/notificationUtils.js";
import emojiRegex from "emoji-regex";
import User from "../../models/User.js";
import { usersOnline } from "./userHandlers.js";

/**
 * Handles socket events related to room-based messages.
 * @param {Socket} socket - Connected socket instance.
 * @param {Server} io - Socket.IO server instance.
 */
const handleMessages = (socket, io) => {
  // === Send Room Message ===
  socket.on("sendPrivateMessage", async ({ sender, roomId, content }) => {
    try {
      if (!sender || !roomId || !content?.trim()) {
        return socket.emit("error", { message: "Invalid message data." });
      }

      const room = await ChatRoom.findById(roomId);
      if (!room || room.isDeleted) return;

      const senderUser = await User.findById(sender);
      if (!senderUser || senderUser.isBanned) {
        return socket.emit("banned", {
          message: "You are currently banned. Please contact support.",
        });
      }

      const emojiMatches = [...content.matchAll(emojiRegex())].map(match => match[0]);

      const newMessage = new Message({
        sender,
        chatRoomId: roomId,
        content,
        status: "delivered",
        emojis: emojiMatches,
      });

      await newMessage.save();

      // Broadcast to room
      io.to(roomId).emit("receiveMessage", newMessage);

      // Notify room members (excluding sender if you want)
      await Promise.all(
        room.members.map((memberId) =>
          createAndSendNotification({
            io,
            type: "room_message",
            recipientId: memberId.toString(),
            senderId: sender,
            content,
            metadata: { roomId },
          })
        )
      );
    } catch (err) {
      console.error("sendPrivateMessage error:", err.message);
      socket.emit("error", { message: "Failed to send message." });
    }
  });

  // === Mark Room Messages As Read ===
  socket.on("markRoomMessagesAsRead", async ({ roomId, userId }) => {
    try {
      if (!roomId || !userId) return;

      const unreadMessages = await Message.find({
        chatRoomId: roomId,
        sender: { $ne: userId },
        "readBy.user": { $ne: userId },
      });

      for (const msg of unreadMessages) {
        msg.readBy.push({ user: userId, readAt: new Date() });
        msg.status = "read";
        await msg.save();

        const senderSocketId = [...usersOnline.entries()].find(([, id]) => id === msg.sender)?.[0];
        if (senderSocketId) {
          io.to(senderSocketId).emit("roomMessageRead", {
            messageId: msg._id.toString(),
            roomId,
            readBy: userId,
          });
        }
      }
    } catch (err) {
      console.error("markRoomMessagesAsRead error:", err.message);
      socket.emit("error", { message: "Failed to mark messages as read." });
    }
  });
};

export { handleMessages };

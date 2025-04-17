import Message from "../../models/Message.js";
import ChatRoom from "../../models/ChatRoom.js";
import { createAndSendNotification } from "../../utils/notificationUtils.js";
import emojiRegex from "emoji-regex";
import User from "../../models/User.js"; // Make sure this is imported
import { usersOnline } from "./userHandlers.js";

const handleMessages = (socket, io) => {
  // === Send Room Message ===
  socket.on("sendPrivateMessage", async ({ sender, roomId, content }) => {
    if (!sender || !roomId || !content) return;

    const room = await ChatRoom.findById(roomId);
    if (!room) return;

    const senderUser = await User.findById(sender);
    if (senderUser?.isBanned) {
        socket.emit("banned", {
        message: "You are currently banned. Please contact support.",
      });
      return; 
    }

    const newMessage = new Message({
      sender,
      chatRoomId: roomId,
      content,
      status: "delivered",
    });

    // Extract emojis
    const regex = emojiRegex();
    let emojis = [];
    let match;
    while ((match = regex.exec(content))) {
      emojis.push(match[0]);
    }
    newMessage.emojis = emojis;

    await newMessage.save();

    io.to(roomId).emit("receiveMessage", newMessage);

    await Promise.all(
      room.members.map((member) =>
        createAndSendNotification({
          io,
          type: "room_message",
          recipientId: member.toString(),
          senderId: sender,
          content,
          metadata: { roomId },
        })
      )
    );
  });

  // === Mark Room Messages As Read ===
  socket.on("markRoomMessagesAsRead", async ({ roomId, userId }) => {
    try {
      const unreadMessages = await Message.find({
        chatRoomId: roomId,
        sender: { $ne: userId },
        "readBy.user": { $ne: userId }, // not already marked by this user
      });

      for (const msg of unreadMessages) {
        msg.readBy.push({ user: userId, readAt: new Date() });
        msg.status = "read"; // Optional: global fallback
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
      console.error("Error marking room messages as read:", err.message);
    }
  });
};

export { handleMessages };

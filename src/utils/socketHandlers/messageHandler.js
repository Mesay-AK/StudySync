import Message from "../../models/Message.js";
import ChatRoom from "../../models/ChatRoom.js";
import { createAndSendNotification } from "./notificationHandlers.js";
import emojiRegex from "emoji-regex";
import User from "../../models/User.js";
import { usersOnline } from "./userHandlers.js";

export const handleMessageEvents = (socket, io) => {
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

      // Extract emojis if any
      const emojiMatches = [...content.matchAll(emojiRegex())].map(match => match[0]);

      // Filter out members who have blocked the sender
      const validMembers = room.members.filter(async (memberId) => {
        const member = await User.findById(memberId);
        return !member.blockedUsers.includes(sender); // Exclude blocked members
      });

      if (validMembers.length === 0) return; // If no valid members to send to

      // Create the message object
      const newMessage = new Message({
        sender,
        chatRoomId: roomId,
        content,
        status: "delivered",
        emojis: emojiMatches,
      });

      // Save the message
      await newMessage.save();

      // Notify all valid members (those who haven't blocked the sender)
      for (const memberId of room.members) {
        const memberUser = await User.findById(memberId);
        if (!memberUser?.blockedUsers.includes(sender)) {
          // Check if the member is online and send the message
          const socketId = [...usersOnline.entries()].find(([, id]) => id === memberId.toString())?.[0];
          if (socketId) {
            io.to(socketId).emit("receiveMessage", newMessage);
          }

          // Send notification if the user hasn't blocked the sender
          await createAndSendNotification({
            io,
            type: "room_message",
            recipientId: memberId.toString(),
            senderId: sender,
            content,
            metadata: { roomId },
          });
        }
      }
    } catch (err) {
      console.error("sendPrivateMessage error:", err.message);
      socket.emit("error", { message: "Failed to send message." });
    }
  });

  socket.on("getRoomMessages", async ({ roomId, userId, page = 1, limit = 20 }) => {
    try {
      const room = await ChatRoom.findById(roomId);
      if (!room) return socket.emit("error", { message: "Room not found." });

      const user = await User.findById(userId);
      if (!user) return socket.emit("error", { message: "User not found." });

      // Exclude messages from blocked users
      const blockedUsers = user.blockedUsers;
      const messages = await Message.find({
        chatRoomId: roomId,
        sender: { $nin: blockedUsers }, // Exclude messages from blocked users
      })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      socket.emit("roomMessages", messages);
    } catch (err) {
      console.error("getRoomMessages error:", err.message);
      socket.emit("error", { message: "Failed to retrieve messages." });
    }
  });

  socket.on("getDirectMessages", async ({ senderId, receiverId, page = 1, limit = 20 }) => {
    try {
      const sender = await User.findById(senderId);
      const receiver = await User.findById(receiverId);
      if (!sender || !receiver) return socket.emit("error", { message: "User not found." });

      // Exclude messages from blocked users
      const blockedUsers = sender.blockedUsers;

      const messages = await DirectMessage.find({
        $or: [
          { sender: senderId, receiver: receiverId },
          { sender: receiverId, receiver: senderId },
        ],
        sender: { $nin: blockedUsers }, // Exclude messages from blocked users
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


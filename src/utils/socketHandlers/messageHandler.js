import Message from "../../models/Message.js";
import ChatRoom from "../../models/ChatRoom.js";
import { createAndSendNotification } from "./notificationHandlers.js"
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


}

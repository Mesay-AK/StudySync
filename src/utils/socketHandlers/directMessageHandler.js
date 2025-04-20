import DirectMessage from "../../models/DirectMessage.js";
import { usersOnline } from "./userHandlers.js";
import { createAndSendNotification } from "./notificationHandlers.js"
import emojiRegex from "emoji-regex";
import User from "../../models/User.js";

/**
 * Handles all socket events related to direct messaging.
 * @param {Socket} socket - The connected socket instance.
 * @param {Server} io - The Socket.IO server instance.
 */
const handleDirectMessages = (socket, io) => {
  socket.on("sendDirectMessage", async ({ sender, receiver, content }) => {
    try {
      if (!sender || !receiver || !content?.trim()) {
        return socket.emit("error", { message: "Invalid message data." });
      }

      const senderUser = await User.findById(sender);
      if (!senderUser || senderUser.isBanned) {
        return socket.emit("banned", {
          message: "You are currently banned. Please contact support.",
        });
      }

      const receiverUser = await User.findById(receiver);
      if (!receiverUser || receiverUser.blockedUsers.includes(sender)) {
        return; // Silently ignore if sender is blocked
      }

      const messageData = {
        sender,
        receiver,
        content,
        status: "sent",
      };

      // Extract emojis if any
      const regex = emojiRegex();
      const emojis = [...content.matchAll(regex)].map(match => match[0]);
      if (emojis.length > 0) messageData.emojis = emojis;

      const newMessage = new DirectMessage(messageData);

      // Check online status
      const receiverSocketId = [...usersOnline.entries()].find(([, id]) => id === receiver)?.[0];
      const senderSocketId = [...usersOnline.entries()].find(([, id]) => id === sender)?.[0];

      if (receiverSocketId) {
        newMessage.status = "delivered";
        io.to(receiverSocketId).emit("receiveDirectMessage", newMessage);

        // Notify the recipient in real-time
        await createAndSendNotification({
          io,
          type: "direct_message",
          recipientId: receiver,
          senderId: sender,
          content,
        });
      }

      await newMessage.save();

      if (senderSocketId) {
        io.to(senderSocketId).emit("messageSent", newMessage);
      }
    } catch (err) {
      console.error("sendDirectMessage error:", err.message);
      socket.emit("error", { message: "Failed to send message." });
    }
  });

  socket.on("markAsRead", async ({ messageId }) => {
    try {
      const message = await DirectMessage.findById(messageId);
      if (!message || message.status === "read") return;

      message.status = "read";
      await message.save();

      const senderSocketId = [...usersOnline.entries()].find(([, id]) => id === message.sender)?.[0];
      if (senderSocketId) {
        io.to(senderSocketId).emit("messageRead", { messageId });
      }
    } catch (err) {
      console.error("markAsRead error:", err.message);
      socket.emit("error", { message: "Failed to mark message as read." });
    }
  });
};

export { handleDirectMessages };

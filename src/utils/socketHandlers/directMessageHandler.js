import DirectMessage from "../../models/DirectMessage.js";
import { usersOnline } from "./userHandlers.js";
import { createAndSendNotification } from "./notificationHandlers.js"
import emojiRegex from "emoji-regex";
import User from "../../models/User.js";

/**
 * Handles all socket events related to direct messaging.
 * @param {Socket} socket - The connected, authenticated socket instance.
 * @param {Server} io - The Socket.IO server instance.
 */
const handleDirectMessages = (socket, io) => {
  const sender = socket.userId;

  socket.on("sendDirectMessage", async ({ receiver, content, media }) => {
    try {
      if (!receiver || (!content?.trim() && !media)) {
        return socket.emit("error", { message: "Invalid message data." });
      }

      const receiverUser = await User.findById(receiver);
      if (!receiverUser || receiverUser.blockedUsers.includes(sender)) {
        return; // Silently ignore if sender is blocked
      }

      const messageData = {
        sender,
        receiver,
        content: content || "",
        status: "sent",
      };
      if (media) {
        messageData.media = media;
        messageData.type = media.type || "file";
      }

      // Extract emojis if any
      const regex = emojiRegex();
      const emojis = content ? [...content.matchAll(regex)].map(match => match[0]) : [];
      if (emojis.length > 0) messageData.emojis = emojis;

      const newMessage = new DirectMessage(messageData);

      // Check online status
      const receiverSocketId = [...usersOnline.entries()].find(([, id]) => id === receiver)?.[0];
      const senderSocketId = [...usersOnline.entries()].find(([, id]) => id === sender)?.[0];

      if (receiverSocketId) {
        newMessage.status = "delivered";
      }

      // Persist before emitting - clients react to these events by immediately
      // re-fetching from the REST API, which would race an unsaved write.
      await newMessage.save();

      if (receiverSocketId) {
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
      if (message.receiver.toString() !== sender) return;

      message.status = "read";
      await message.save();

      const senderSocketId = [...usersOnline.entries()].find(([, id]) => id === message.sender.toString())?.[0];
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

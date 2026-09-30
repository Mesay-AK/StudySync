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
      if (!receiverUser) {
        return socket.emit("error", { message: "That user no longer exists." });
      }
      if (receiverUser.blockedUsers.includes(sender)) {
        return; // Silently ignore if sender is blocked - telling them would leak the block
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

      // Check online status (existence check only - which specific socket
      // doesn't matter here, unlike the emit targeting below).
      const receiverOnline = [...usersOnline.values()].includes(receiver);

      if (receiverOnline) {
        newMessage.status = "delivered";
      }

      // Persist before emitting - clients react to these events by immediately
      // re-fetching from the REST API, which would race an unsaved write.
      await newMessage.save();

      if (receiverOnline) {
        // Emitting to the per-user room (joined in userHandlers.js on
        // connect) reaches every socket that user has open, not just
        // whichever one happened to connect first.
        io.to(receiver).emit("receiveDirectMessage", newMessage);

        // Notify the recipient in real-time
        await createAndSendNotification({
          io,
          type: "direct_message",
          recipientId: receiver,
          senderId: sender,
          content,
        });
      }

      io.to(sender).emit("messageSent", newMessage);
    } catch (err) {
      console.error("sendDirectMessage error:", err.message);
      socket.emit("error", { message: "Failed to send message." });
    }
  });

  socket.on("markAsRead", async ({ messageId }) => {
    try {
      const message = await DirectMessage.findById(messageId);
      if (!message || message.status === "read") return;
      if (message.receiver.toString() !== sender) {
        return socket.emit("error", { message: "You can't mark that message as read." });
      }

      message.status = "read";
      await message.save();

      io.to(message.sender.toString()).emit("messageRead", { messageId });
    } catch (err) {
      console.error("markAsRead error:", err.message);
      socket.emit("error", { message: "Failed to mark message as read." });
    }
  });
};

export { handleDirectMessages };

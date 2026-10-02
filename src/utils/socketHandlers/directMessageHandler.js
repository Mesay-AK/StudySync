import DirectMessage from "../../models/DirectMessage.js";
import { isUserOnline } from "./userHandlers.js";
import { createAndSendNotification } from "./notificationHandlers.js"
import { prepareDirectMessage } from "../directMessageRules.js";
import { safeOn, payloadOf } from "./safeOn.js";
import logger from "../logger.js";

/**
 * Handles all socket events related to direct messaging.
 * @param {Socket} socket - The connected, authenticated socket instance.
 * @param {Server} io - The Socket.IO server instance.
 */
const handleDirectMessages = (socket, io) => {
  const sender = socket.userId;

  safeOn(socket, "sendDirectMessage", async (payload) => {
    const { receiver, content, media } = payloadOf(payload);
    try {
      const prepared = await prepareDirectMessage({ senderId: sender, receiverId: receiver, content, media });
      if (prepared.silent) return; // Sender is blocked - telling them would leak the block
      if (prepared.error) return socket.emit("error", { message: prepared.error });

      const newMessage = new DirectMessage(prepared.message);

      // Check online status - cluster-aware via io.in(userId).fetchSockets(),
      // so this is correct even if the receiver is connected to a different
      // app instance than the sender.
      const receiverOnline = await isUserOnline(io, String(receiver));

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
        io.to(String(receiver)).emit("receiveDirectMessage", newMessage);
      }

      // Stored whether or not the receiver is online - it used to be created
      // only for online receivers, so someone returning found notifications
      // for room chatter but none for messages sent directly to them. The
      // live emit inside is a no-op when they have no socket open.
      await createAndSendNotification({
        io,
        type: "direct_message",
        recipientId: String(receiver),
        senderId: sender,
        content: newMessage.content,
      });

      io.to(sender).emit("messageSent", newMessage);
    } catch (err) {
      logger.error({ err, sender }, "sendDirectMessage error");
      socket.emit("error", { message: "Failed to send message." });
    }
  });

  safeOn(socket, "markAsRead", async (payload) => {
    const { messageId } = payloadOf(payload);
    try {
      const message = await DirectMessage.findById(messageId);
      if (!message || message.status === "read") return;
      if (message.receiver.toString() !== sender) {
        return socket.emit("error", { message: "You can't mark that message as read." });
      }

      message.status = "read";
      message.readAt = new Date();
      await message.save();

      io.to(message.sender.toString()).emit("messageRead", { messageId: message._id.toString() });
    } catch (err) {
      logger.error({ err, sender }, "markAsRead error");
      socket.emit("error", { message: "Failed to mark message as read." });
    }
  });
};

export { handleDirectMessages };

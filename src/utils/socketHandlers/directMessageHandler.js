import DirectMessage from "../../models/DirectMessage.js";
import { usersOnline } from "./userHandlers.js";
import { createAndSendNotification } from "../../utils/notificationUtils.js";

const handleDirectMessages = (socket, io) => {
  // === Send Direct Message ===
  socket.on("sendDirectMessage", async ({ sender, receiver, content }) => {
    if (!sender || !receiver || !content) return;

    const newMessage = new DirectMessage({
      sender,
      receiver,
      content,
      status: "sent", // Initial status
    });

    const receiverSocketId = [...usersOnline.entries()].find(([, id]) => id === receiver)?.[0];
    const senderSocketId = [...usersOnline.entries()].find(([, id]) => id === sender)?.[0];

    if (receiverSocketId) {
      newMessage.status = "delivered";
      await newMessage.save();

      io.to(receiverSocketId).emit("receiveDirectMessage", newMessage);

      await createAndSendNotification({
        io,
        type: "direct_message",
        recipientId: receiver,
        senderId: sender,
        content,
      });
    } else {
      // Save as 'sent' if offline
      await newMessage.save();
    }

    if (senderSocketId) {
      io.to(senderSocketId).emit("messageSent", newMessage);
    }
  });

  // === Mark Message As Read ===
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
      console.error("Error marking message as read:", err.message);
    }
  });
};

export { handleDirectMessages };

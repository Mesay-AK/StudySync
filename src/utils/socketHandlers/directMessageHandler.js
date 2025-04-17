import DirectMessage from "../../models/DirectMessage.js";
import { usersOnline } from "./userHandlers.js";
import { createAndSendNotification } from "../../utils/notificationUtils.js";
import emojiRegex from "emoji-regex";
import User from "../../models/User.js";

const handleDirectMessages = (socket, io) => {
  socket.on("sendDirectMessage", async ({ sender, receiver, content }) => {
    if (!sender || !receiver || !content) return;

    const senderUser = await User.findById(sender);
    if (senderUser?.isBanned) {
        socket.emit("banned", {
        message: "You are currently banned. Please contact support.",
  
});
      return; 
    }

    const receiverUser = await User.findById(receiver);
    if (!receiverUser || receiverUser.blockedUsers.includes(sender)) {
      return; 
    }

    const newMessage = new DirectMessage({
      sender,
      receiver,
      content,
      status: "sent",
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
      const regex = emojiRegex();
      let emojis = [];
      let match;
      while ((match = regex.exec(content))) {
        emojis.push(match[0]);
      }
      newMessage.emojis = emojis;
      await newMessage.save();
    }

    if (senderSocketId) {
      io.to(senderSocketId).emit("messageSent", newMessage);
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
      console.error("Error marking message as read:", err.message);
    }
  });
};

export { handleDirectMessages };

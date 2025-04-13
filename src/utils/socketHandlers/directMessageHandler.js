import DirectMessage from "../../models/DirectMessage.js";
import { usersOnline } from "./userHandlers.js";
import { createAndSendNotification } from "../../utils/notificationUtils.js";

const handleDirectMessages = (socket, io) => {
  socket.on("sendDirectMessage", async ({ sender, receiver, content }) => {
    if (!sender || !receiver || !content) return;

    const newMessage = new DirectMessage({ sender, receiver, content });
    await newMessage.save();

    const receiverSocketId = [...usersOnline.entries()].find(([, id]) => id === receiver)?.[0];
    const senderSocketId = [...usersOnline.entries()].find(([, id]) => id === sender)?.[0];

    if (receiverSocketId) {
      io.to(receiverSocketId).emit("receiveDirectMessage", newMessage);
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
  });
};

export { handleDirectMessages };

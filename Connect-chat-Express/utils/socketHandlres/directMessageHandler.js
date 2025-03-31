import DirectMessage from "../models/DirectMessage.js";
import { usersOnline } from "./userHandler.js";

const handleDirectMessages = (socket, io) => {
  socket.on("sendDirectMessage", async ({ sender, receiver, content }) => {
    const newMessage = new DirectMessage({ sender, receiver, content });
    await newMessage.save();

    const receiverSocketId = [...usersOnline.entries()].find(([, id]) => id === receiver)?.[0];

    if (receiverSocketId) {
      io.to(receiverSocketId).emit("receiveDirectMessage", newMessage);
    }
  });
};

export { handleDirectMessages };

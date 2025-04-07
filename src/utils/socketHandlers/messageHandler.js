import Message from "../../models/Message.js";
import ChatRoom from "../../models/ChatRoom.js";

const handleMessages = (socket, io) => {
  socket.on("sendMessage", async ({ sender, receiver, content, messageType }) => {
    if (!sender || !receiver || !content) return;

    const newMessage = new Message({ sender, receiver, content, messageType });
    await newMessage.save();

    io.to(receiver).emit("receiveMessage", newMessage);
  });

  socket.on("sendPrivateMessage", async ({ sender, roomId, content }) => {
    const newMessage = new Message({ sender, chatRoomId: roomId, content });
    await newMessage.save();

    io.to(roomId).emit("receiveMessage", newMessage);

    const room = await ChatRoom.findById(roomId);
    if (room) {
      room.members.forEach((member) => {
        io.to(member.toString()).emit("newRoomMessageNotification", {
          sender,
          message: content,
          roomId,
        });
      });
    }
  });
};

export { handleMessages };

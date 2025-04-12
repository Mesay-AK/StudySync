import Message from "../../models/Message.js";
import ChatRoom from "../../models/ChatRoom.js";

const handleMessages = (socket, io) => {
  socket.on("sendPrivateMessage", async ({ sender, roomId, content }) => {
    if (!sender || !roomId || !content) return;

    const newMessage = new Message({ sender, chatRoomId: roomId, content });
    await newMessage.save();

    io.to(roomId).emit("receiveMessage", newMessage);

    const room = await ChatRoom.findById(roomId);
    if (room) {
      room.members.forEach((member) => {
        if (member.toString() !== sender) {
          io.to(member.toString()).emit("newRoomMessageNotification", {
            sender,
            message: content,
            roomId,
          });
        }
      });
    }
  });
};

export { handleMessages };

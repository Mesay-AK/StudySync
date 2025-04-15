import Message from "../../models/Message.js";
import ChatRoom from "../../models/ChatRoom.js";
import { createAndSendNotification } from "../../utils/notificationUtils.js";

const handleMessages = (socket, io) => {
  // === Send Message to Chat Room ===
  socket.on("sendPrivateMessage", async ({ sender, roomId, content }) => {
    if (!sender || !roomId || !content) return;

    const newMessage = new Message({
      sender,
      chatRoomId: roomId,
      content,
      status: "sent", // Initial status
    });

    const room = await ChatRoom.findById(roomId);
    if (!room) return;

    // Set status to delivered since everyone in the room will receive it live
    newMessage.status = "delivered";
    await newMessage.save();

    io.to(roomId).emit("receiveMessage", newMessage);

    // Send a notification to each room member
    await Promise.all(
      room.members.map((member) =>
        createAndSendNotification({
          io,
          type: "room_message",
          recipientId: member.toString(),
          senderId: sender,
          content,
          metadata: { roomId },
        })
      )
    );
  });

  // === Mark Room Messages As Read ===
  socket.on("markRoomMessagesAsRead", async ({ roomId, userId }) => {
    try {
      const unreadMessages = await Message.find({
        chatRoomId: roomId,
        status: { $ne: "read" },
        sender: { $ne: userId },
      });

      const updatedMessages = await Promise.all(
        unreadMessages.map(async (msg) => {
          msg.status = "read";
          await msg.save();

          // Notify original sender
          const senderSocketId = [...usersOnline.entries()].find(([, id]) => id === msg.sender)?.[0];
          if (senderSocketId) {
            io.to(senderSocketId).emit("roomMessageRead", {
              messageId: msg._id.toString(),
              roomId,
              readBy: userId,
            });
          }

          return msg;
        })
      );
    } catch (err) {
      console.error("Error marking room messages as read:", err.message);
    }
  });
};

export { handleMessages };

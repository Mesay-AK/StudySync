import User from "../../models/User.js";
import ChatRoom from "../../models/ChatRoom.js";
import { usersOnline } from "./userHandlers.js";

const handleTypingIndicators = (socket, io) => {
  const userId = socket.userId;

  const broadcastToRoom = async (event, roomId, senderUser) => {
    const room = await ChatRoom.findById(roomId);
    if (!room) return;

    for (const memberId of room.members) {
      if (memberId.toString() === userId) continue;

      const member = await User.findById(memberId);
      const memberSocketId = [...usersOnline.entries()].find(([, id]) => id === memberId.toString())?.[0];

      if (
        member &&
        !member.blockedUsers.includes(userId) &&
        !senderUser.blockedUsers.includes(member._id.toString()) &&
        memberSocketId
      ) {
        io.to(memberSocketId).emit(event, { userId, roomId, isDirect: false });
      }
    }
  };

  const broadcastToDirect = async (event, receiverId, senderUser) => {
    const receiverUser = await User.findById(receiverId);
    const receiverSocketId = [...usersOnline.entries()].find(([, id]) => id === receiverId)?.[0];

    if (
      receiverUser &&
      !receiverUser.blockedUsers.includes(userId) &&
      !senderUser.blockedUsers.includes(receiverId) &&
      receiverSocketId
    ) {
      io.to(receiverSocketId).emit(event, { userId, isDirect: true });
    }
  };

  socket.on("typing", async ({ roomId, isDirect = false, receiverId = null }) => {
    try {
      const senderUser = await User.findById(userId);
      if (!senderUser) return;

      if (isDirect && receiverId) {
        await broadcastToDirect("typing", receiverId, senderUser);
      } else if (!isDirect && roomId) {
        await broadcastToRoom("typing", roomId, senderUser);
      }
    } catch (error) {
      console.error("Error handling 'typing' event:", error.message);
    }
  });

  socket.on("stopTyping", async ({ roomId, isDirect = false, receiverId = null }) => {
    try {
      const senderUser = await User.findById(userId);
      if (!senderUser) return;

      if (isDirect && receiverId) {
        await broadcastToDirect("stopTyping", receiverId, senderUser);
      } else if (!isDirect && roomId) {
        await broadcastToRoom("stopTyping", roomId, senderUser);
      }
    } catch (error) {
      console.error("Error handling 'stopTyping' event:", error.message);
    }
  });
};

export { handleTypingIndicators };

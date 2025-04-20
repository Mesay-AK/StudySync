import User from "../../models/User.js";
import ChatRoom from "../../models/ChatRoom.js";
import { usersOnline } from "./userHandlers.js";

const handleTypingIndicators = (socket, io) => {

  // === Handle Typing Start ===
  socket.on("typing", async ({ roomId, userId, isDirect = false, receiverId = null }) => {
    try {
      const senderUser = await User.findById(userId);
      if (!senderUser) return;

      if (isDirect && receiverId) {
        const receiverUser = await User.findById(receiverId);
        const receiverSocketId = [...usersOnline.entries()].find(([, id]) => id === receiverId)?.[0];

        if (
          receiverUser &&
          !receiverUser.blockedUsers.includes(userId) &&
          !senderUser.blockedUsers.includes(receiverId) &&
          receiverSocketId
        ) {
          io.to(receiverSocketId).emit("typing", { userId, isDirect: true });
        }
      } else if (!isDirect && roomId) {
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
            io.to(memberSocketId).emit("typing", { userId, roomId, isDirect: false });
          }
        }
      } else {
        console.error("Missing parameters for 'typing' event.");
      }
    } catch (error) {
      console.error("Error handling 'typing' event:", error.message);
    }
  });

  // === Handle Typing Stop ===
  socket.on("stopTyping", async ({ roomId, userId, isDirect = false, receiverId = null }) => {
    try {
      const senderUser = await User.findById(userId);
      if (!senderUser) return;

      if (isDirect && receiverId) {
        const receiverUser = await User.findById(receiverId);
        const receiverSocketId = [...usersOnline.entries()].find(([, id]) => id === receiverId)?.[0];

        if (
          receiverUser &&
          !receiverUser.blockedUsers.includes(userId) &&
          !senderUser.blockedUsers.includes(receiverId) &&
          receiverSocketId
        ) {
          io.to(receiverSocketId).emit("stopTyping", { userId, isDirect: true });
        }
      } else if (!isDirect && roomId) {
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
            io.to(memberSocketId).emit("stopTyping", { userId, roomId, isDirect: false });
          }
        }
      } else {
        console.error("Missing parameters for 'stopTyping' event.");
      }
    } catch (error) {
      console.error("Error handling 'stopTyping' event:", error.message);
    }
  });
};

export { handleTypingIndicators };

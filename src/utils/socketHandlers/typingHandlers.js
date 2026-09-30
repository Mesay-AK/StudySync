import User from "../../models/User.js";
import ChatRoom from "../../models/ChatRoom.js";

const handleTypingIndicators = (socket, io) => {
  const userId = socket.userId;

  const broadcastToRoom = async (event, roomId, senderUser) => {
    const room = await ChatRoom.findById(roomId);
    if (!room) return;

    for (const memberId of room.members) {
      if (memberId.toString() === userId) continue;

      const member = await User.findById(memberId);

      if (
        member &&
        !member.blockedUsers.includes(userId) &&
        !senderUser.blockedUsers.includes(member._id.toString())
      ) {
        // Emitting to the per-user room (joined in userHandlers.js on
        // connect) reaches every socket that user has open, and is a no-op
        // if they're offline - no need to look up a specific socket id.
        io.to(memberId.toString()).emit(event, { userId, roomId, isDirect: false });
      }
    }
  };

  const broadcastToDirect = async (event, receiverId, senderUser) => {
    const receiverUser = await User.findById(receiverId);

    if (
      receiverUser &&
      !receiverUser.blockedUsers.includes(userId) &&
      !senderUser.blockedUsers.includes(receiverId)
    ) {
      io.to(receiverId).emit(event, { userId, isDirect: true });
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

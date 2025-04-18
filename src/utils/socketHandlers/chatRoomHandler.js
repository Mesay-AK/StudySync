import ChatRoom from "../../models/ChatRoom.js";

const handleChatRooms = (socket) => {
  socket.on("joinRoom", async ({ userId, roomId }) => {
    const room = await ChatRoom.findById(roomId);
    if (!room || room.isDeleted) return;

    const senderUser = await User.findById(userId);
    if (senderUser?.isBanned) {
        socket.emit("banned", {
        message: "You are currently banned. Please contact support.",
      });
      return; 
    }

    const alreadyMember = room.members.includes(userId);
    const isAllowed =
      room.type === "public" || (room.type === "private" && room.invitedUsers.includes(userId));

    if (isAllowed && !alreadyMember) {
      room.members.push(userId);
      await room.save();
    }

    if (isAllowed) {
      socket.join(roomId);

      socket.to(roomId).emit("userJoined", { userId, roomId });
      const messages = await Message.find({ chatRoomId: roomId }).sort({ createdAt: -1 }).limit(20);
      socket.emit('previousMessages', messages);
    }
  });

  socket.on("getRoomParticipants", async (roomId, callback) => {
    try {
      const sockets = await io.in(roomId).fetchSockets();

      const participantIds = sockets.map(s => s.userId); 
      const participants = await User.find({ _id: { $in: participantIds } }).select("username profilePicture");

      callback({ success: true, participants });
    } catch (err) {
      console.error("Error fetching participants:", err);
      callback({ success: false, message: "Error fetching participants" });
    }
  });

  socket.on("leaveRoom", async ({ userId, roomId }) => {
    const room = await ChatRoom.findById(roomId);
    if (!room) return;

    room.members = room.members.filter((id) => id.toString() !== userId);
    await room.save();

    socket.leave(roomId);
    socket.to(roomId).emit("userLeft", { userId, roomId });
  });
};

export { handleChatRooms };

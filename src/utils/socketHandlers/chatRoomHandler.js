import ChatRoom from "../../models/ChatRoom.js";

const handleChatRooms = (socket) => {
  socket.on("joinPublicRoom", async ({ userId, roomId }) => {
    const room = await ChatRoom.findById(roomId);
    if (!room || room.type !== "public") return;

    if (!room.members.includes(userId)) {
      room.members.push(userId);
      await room.save();
    }

    socket.join(roomId);
    console.log(`User ${userId} joined public room ${roomId}`);
  });

  socket.on("joinPrivateRoom", async ({ userId, roomId }) => {
    const room = await ChatRoom.findById(roomId);
    if (!room || room.type !== "private" || !room.invitedUsers.includes(userId)) return;

    if (!room.members.includes(userId)) {
      room.members.push(userId);
      await room.save();
    }

    socket.join(roomId);
    console.log(`User ${userId} joined private room ${roomId}`);
  });
};

export { handleChatRooms };

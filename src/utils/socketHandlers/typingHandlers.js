const handleTypingIndicators = (socket, io) => {
  socket.on("typing", ({ roomId, userId, isDirect = false, receiverId = null }) => {
    if (isDirect && receiverId) {
      io.to(receiverId).emit("typing", { userId, isDirect: true });
    } else {
      io.to(roomId).emit("typing", { userId, roomId, isDirect: false });
    }
  });

  socket.on("stopTyping", ({ roomId, userId, isDirect = false, receiverId = null }) => {
    if (isDirect && receiverId) {
      io.to(receiverId).emit("stopTyping", { userId, isDirect: true });
    } else {
      io.to(roomId).emit("stopTyping", { userId, roomId, isDirect: false });
    }
  });
};

export { handleTypingIndicators };

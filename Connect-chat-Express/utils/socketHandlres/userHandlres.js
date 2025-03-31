const usersOnline = new Map();

const handleUserConnection = (socket) => {
  socket.on("userConnected", (userId) => {
    usersOnline.set(socket.id, userId);
    console.log(`User ${userId} connected with socket ${socket.id}`);
  });

  socket.on("disconnect", () => {
    const userId = usersOnline.get(socket.id);
    usersOnline.delete(socket.id);
    console.log(`User ${userId} disconnected`);
  });
};

export { handleUserConnection, usersOnline };

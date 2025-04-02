
const usersOnline = new Map();

const handleUserConnection = (socket) => {
  socket.on("userConnected", (userId) => {
    usersOnline.set(socket.id, userId);
    socket.join(userId);
    console.log(`User ${userId} connected with socket ${socket.id}`);
  });

  socket.on("disconnect", () => {
    usersOnline.forEach((value, key) => {
      if (value === socket.id) usersOnline.delete(key);
    });
    console.log(`User Disconnected: ${socket.id}`);
  });
};

export { handleUserConnection, usersOnline };

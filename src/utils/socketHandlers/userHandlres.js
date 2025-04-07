import User from "../models/User.js";

const usersOnline = new Map();

const handleUserConnection = (socket, io) => {
  socket.on("userConnected", async (userId) => {
    usersOnline.set(socket.id, userId);
    socket.join(userId);

    console.log(`User ${userId} connected with socket ${socket.id}`);

    try {
      await User.findByIdAndUpdate(userId, { onlineStatus: true, lastSeen: new Date() });
      io.emit("updateUserStatus", { userId, onlineStatus: true });
    } catch (error) {
      console.error("Error updating user status:", error);
    }
  });

  socket.on("disconnect", async () => {
    const userId = usersOnline.get(socket.id);
    usersOnline.delete(socket.id);

    console.log(`User Disconnected: ${socket.id}`);

    if (userId) {
      try {
        await User.findByIdAndUpdate(userId, { onlineStatus: false, lastSeen: new Date() });
        io.emit("updateUserStatus", { userId, onlineStatus: false });
      } catch (error) {
        console.error("Error updating user status:", error);
      }
    }
  });
};

export { handleUserConnection, usersOnline };

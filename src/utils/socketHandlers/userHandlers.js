import User from "../../models/User.js";

const usersOnline = new Map();

/**
 * Marks the authenticated socket's user online and wires up presence
 * broadcast on disconnect. Identity comes from `socket.userId`, set by
 * socketAuthMiddleware during the handshake - never from client input.
 */
const handleUserConnection = (socket, io) => {
  const userId = socket.userId;

  usersOnline.set(socket.id, userId);
  socket.join(userId);

  User.findByIdAndUpdate(userId, {
    onlineStatus: "online",
    lastSeen: new Date(),
  }).catch((error) => console.error("Error marking user online:", error.message));

  io.emit("updateUserStatus", { userId, onlineStatus: true });

  socket.on("disconnect", async () => {
    try {
      usersOnline.delete(socket.id);
      console.log(`User Disconnected: ${socket.id}`);

      const stillConnected = [...usersOnline.values()].includes(userId);
      if (stillConnected) return;

      const lastSeen = new Date();
      await User.findByIdAndUpdate(userId, { onlineStatus: "offline", lastSeen });

      io.emit("updateUserStatus", { userId, onlineStatus: false, lastSeen });
    } catch (error) {
      console.error("Error handling user disconnection:", error.message);
    }
  });
};

export { handleUserConnection, usersOnline };

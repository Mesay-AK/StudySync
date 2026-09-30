import User from "../../models/User.js";
import logger from "../logger.js";

/**
 * Marks the authenticated socket's user online and wires up presence
 * broadcast on disconnect. Identity comes from `socket.userId`, set by
 * socketAuthMiddleware during the handshake - never from client input.
 *
 * Presence is tracked via Socket.IO's own per-user room (joined below, same
 * room notifications already deliver to) and queried through
 * io.in(userId).fetchSockets() rather than a local in-memory Map - with the
 * Redis adapter installed (config/socket.js), fetchSockets() is
 * cluster-aware and reflects sockets connected to ANY instance, whereas a
 * plain Map would only ever see this one process's connections.
 */
const handleUserConnection = (socket, io) => {
  const userId = socket.userId;

  socket.join(userId);

  User.findByIdAndUpdate(userId, {
    onlineStatus: "online",
    lastSeen: new Date(),
  }).catch((error) => logger.error({ err: error, userId }, "Error marking user online"));

  io.emit("updateUserStatus", { userId, onlineStatus: true });

  socket.on("disconnect", async () => {
    try {
      logger.info({ userId, socketId: socket.id }, "Socket disconnected");

      // Socket.IO's own _cleanup() removes this socket from all its rooms
      // before the "disconnect" event fires, so any sockets still in the
      // userId room here are genuinely other connections (other tabs/
      // devices, or this same user connected to a different instance).
      const remainingSockets = await io.in(userId).fetchSockets();
      if (remainingSockets.length > 0) return;

      const lastSeen = new Date();
      await User.findByIdAndUpdate(userId, { onlineStatus: "offline", lastSeen });

      io.emit("updateUserStatus", { userId, onlineStatus: false, lastSeen });
    } catch (error) {
      logger.error({ err: error, userId }, "Error handling user disconnection");
    }
  });
};

export const isUserOnline = async (io, userId) => {
  const sockets = await io.in(userId).fetchSockets();
  return sockets.length > 0;
};

export { handleUserConnection };

import logger from "../logger.js";

// Registers a socket event handler that can never take the process down.
// Socket.IO does nothing with the promise an async handler returns, so any
// throw outside the handler's own try/catch (including destructuring a
// missing payload, e.g. a bare `socket.emit("typing")`) used to become an
// unhandled rejection - which crashes Node, disconnecting every user.
export const safeOn = (socket, event, handler) => {
  socket.on(event, async (...args) => {
    try {
      await handler(...args);
    } catch (err) {
      logger.error({ err, event, userId: socket.userId }, "Unhandled socket handler error");
      socket.emit("error", { message: "Request failed." });
    }
  });
};

// Event payloads come straight from the client: treat anything that isn't an
// object (undefined, null, a string...) as an empty payload.
export const payloadOf = (payload) => (payload && typeof payload === "object" ? payload : {});

// Ends every live socket the user has open (all tabs, every app instance via
// the Redis adapter). Used when an account is banned or deleted - socket auth
// only runs at handshake time, so already-open sockets would otherwise keep
// working indefinitely.
export const disconnectUser = (io, userId) => {
  io?.in(String(userId)).disconnectSockets(true);
};

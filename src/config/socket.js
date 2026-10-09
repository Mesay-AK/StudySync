import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { socketAuthMiddleware } from "../middleware/socketAuthMiddleware.js";
import { handleUserConnection } from "../utils/socketHandlers/userHandlers.js";
import { handleDirectMessages } from "../utils/socketHandlers/directMessageHandler.js";
import { handleMessages } from "../utils/socketHandlers/messageHandler.js";
import { handleChatRooms } from "../utils/socketHandlers/chatRoomHandler.js";
import { handleTypingIndicators } from "../utils/socketHandlers/typingHandlers.js";
import { corsOrigin } from "./corsOrigin.js";
import { config } from "./env.js";
import redisClient from "./redisClient.js";
import logger from "../utils/logger.js";

const setupSocket = async (server) => {
  const io = new Server(server, {
    cors: { origin: corsOrigin, credentials: true },
    // `cors` only sets response headers, and browsers don't apply CORS to
    // WebSocket upgrades at all - so without this, any website could open a
    // live connection carrying a visitor's (SameSite=None) cookies. Refuse
    // browser origins that aren't allowed; no Origin = not a browser page.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, !origin || config.network.isAllowedOrigin(origin));
    },
  });

  // Without this, a message/notification emitted from the instance a sender
  // is connected to would never reach a recipient connected to a different
  // instance - Socket.IO's default in-memory adapter only broadcasts within
  // one process. The adapter needs its own dedicated pub/sub connections
  // (a Redis connection in subscribe mode can't also run normal commands),
  // so it duplicates the shared client rather than reusing it directly.
  const pubClient = redisClient.duplicate();
  const subClient = pubClient.duplicate();
  pubClient.on("error", (err) => logger.error({ err }, "Socket.IO Redis adapter pub client error"));
  subClient.on("error", (err) => logger.error({ err }, "Socket.IO Redis adapter sub client error"));

  // The adapter subscribes immediately once wired up - if either duplicated
  // connection hasn't finished its own handshake (including AUTH, when
  // Redis requires a password) by then, that first SUBSCRIBE/PSUBSCRIBE
  // command is rejected with NOAUTH instead of being queued. Waiting for
  // "ready" on both avoids that race.
  await Promise.all([
    new Promise((resolve) => pubClient.once("ready", resolve)),
    new Promise((resolve) => subClient.once("ready", resolve)),
  ]);
  io.adapter(createAdapter(pubClient, subClient));

  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
    logger.info({ userId: socket.userId, socketId: socket.id }, "Socket connected");

    // Auth is only checked at handshake, so a socket used to outlive its
    // access token indefinitely. End it when the token expires; the client
    // refreshes its session and reconnects (the announcement tells it this
    // is an expiry, not a ban - lib/socket.js on the frontend).
    const expiresIn = Math.max(0, (socket.tokenExpiresAt ?? Infinity) - Date.now());
    if (Number.isFinite(expiresIn)) {
      const expiryTimer = setTimeout(() => {
        socket.emit("session_expired");
        socket.disconnect(true);
      }, expiresIn);
      socket.on("disconnect", () => clearTimeout(expiryTimer));
    }

    handleUserConnection(socket, io);
    handleDirectMessages(socket, io);
    handleChatRooms(socket, io);
    handleMessages(socket, io);
    handleTypingIndicators(socket, io);
  });

  return io;
};

export default setupSocket;

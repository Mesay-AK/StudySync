import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { socketAuthMiddleware } from "../middleware/socketAuthMiddleware.js";
import { handleUserConnection } from "../utils/socketHandlers/userHandlers.js";
import { handleDirectMessages } from "../utils/socketHandlers/directMessageHandler.js";
import { handleMessages } from "../utils/socketHandlers/messageHandler.js";
import { handleChatRooms } from "../utils/socketHandlers/chatRoomHandler.js";
import { handleTypingIndicators } from "../utils/socketHandlers/typingHandlers.js";
import { corsOrigin } from "./corsOrigin.js";
import redisClient from "./redisClient.js";
import logger from "../utils/logger.js";

const setupSocket = async (server) => {
  const io = new Server(server, {
    cors: { origin: corsOrigin, credentials: true },
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

    handleUserConnection(socket, io);
    handleDirectMessages(socket, io);
    handleChatRooms(socket, io);
    handleMessages(socket, io);
    handleTypingIndicators(socket, io);
  });

  return io;
};

export default setupSocket;

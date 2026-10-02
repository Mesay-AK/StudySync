import User from "../../models/User.js";
import ChatRoom from "../../models/ChatRoom.js";
import { safeOn, payloadOf } from "./safeOn.js";
import logger from "../logger.js";

const handleTypingIndicators = (socket, io) => {
  const userId = socket.userId;

  const broadcastToRoom = async (event, roomId, senderUser) => {
    const room = await ChatRoom.findById(roomId);
    if (!room || room.isDeleted) return;
    // Only members may signal typing - this used to accept any room id, so
    // anyone could push "typing..." into private rooms they weren't in.
    if (!room.members.some((m) => m.toString() === userId)) return;

    // One query per keystroke instead of one per member.
    const recipients = await User.find({
      _id: { $in: room.members, $ne: userId, $nin: senderUser.blockedUsers },
      blockedUsers: { $ne: userId },
    }).select("_id");

    for (const member of recipients) {
      // Emitting to the per-user room (joined in userHandlers.js on
      // connect) reaches every socket that user has open, and is a no-op
      // if they're offline - no need to look up a specific socket id.
      io.to(member._id.toString()).emit(event, { userId, roomId: room._id.toString(), isDirect: false });
    }
  };

  const broadcastToDirect = async (event, receiverId, senderUser) => {
    const receiverUser = await User.findById(receiverId);

    if (
      receiverUser &&
      !receiverUser.blockedUsers.includes(userId) &&
      !senderUser.blockedUsers.includes(receiverUser._id)
    ) {
      io.to(receiverUser._id.toString()).emit(event, { userId, isDirect: true });
    }
  };

  for (const event of ["typing", "stopTyping"]) {
    safeOn(socket, event, async (payload) => {
      const { roomId, isDirect = false, receiverId = null } = payloadOf(payload);
      try {
        const senderUser = await User.findById(userId);
        if (!senderUser) return;

        if (isDirect && receiverId) {
          await broadcastToDirect(event, receiverId, senderUser);
        } else if (!isDirect && roomId) {
          await broadcastToRoom(event, roomId, senderUser);
        }
      } catch (error) {
        logger.error({ err: error, userId }, `Error handling '${event}' event`);
      }
    });
  }
};

export { handleTypingIndicators };

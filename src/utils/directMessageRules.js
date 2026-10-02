import { isValidObjectId } from "mongoose";
import emojiRegex from "emoji-regex";
import User from "../models/User.js";
import { normalizeMedia } from "./mediaValidation.js";

// The single set of rules for sending a DM, shared by the socket handler and
// POST /messages/send - the REST path used to skip the block check and the
// receiver-exists check entirely.
//
// Resolves either { error, status, silent } or { message } - a plain object
// ready for `new DirectMessage(...)`. `silent` marks the blocked case, which
// the socket path swallows rather than revealing the block to the sender.
export const prepareDirectMessage = async ({ senderId, receiverId, content, media }) => {
  if (content !== undefined && content !== null && typeof content !== "string") {
    return { status: 400, error: "Invalid message data." };
  }
  const text = content || "";

  const normalized = normalizeMedia(media);
  if (normalized.error) return { status: 400, error: normalized.error };

  if (!receiverId || (!text.trim() && !normalized.media)) {
    return { status: 400, error: "Invalid message data." };
  }
  if (!isValidObjectId(receiverId)) return { status: 400, error: "Invalid receiver." };

  const receiverUser = await User.findById(receiverId).select("blockedUsers");
  if (!receiverUser) return { status: 404, error: "That user no longer exists." };
  if (receiverUser.blockedUsers.some((id) => id.toString() === String(senderId))) {
    return { status: 403, error: "You can't send messages to this user.", silent: true };
  }

  const message = { sender: senderId, receiver: receiverId, content: text, status: "sent" };
  if (normalized.media) message.media = normalized.media;

  const emojis = [...text.matchAll(emojiRegex())].map((match) => match[0]);
  if (emojis.length > 0) message.emojis = emojis;

  return { message };
};

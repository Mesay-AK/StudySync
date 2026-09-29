import DirectMessage from "../models/DirectMessage.js";
import User from "../models/User.js";
import Report from "../models/Report.js";
import mongoose, { isValidObjectId } from "mongoose";
import { sendError } from "../utils/errorResponse.js";
import { escapeRegex } from "../utils/escapeRegex.js";

// Summarizes each conversation the user is part of: the other participant,
// the last message, and how many are unread - what a conversation list needs.
export const getConversations = async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.user.id);

  try {
    const conversations = await DirectMessage.aggregate([
      { $match: { $or: [{ sender: userId }, { receiver: userId }], isDeleted: false } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ["$sender", userId] }, "$receiver", "$sender"],
          },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$receiver", userId] }, { $ne: ["$status", "read"] }] },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { "lastMessage.createdAt": -1 } },
    ]);

    const partnerIds = conversations.map((c) => c._id);
    const partners = await User.find({ _id: { $in: partnerIds } })
      .select("username displayName profilePicture onlineStatus lastSeen");
    const partnerById = new Map(partners.map((p) => [p._id.toString(), p]));

    const result = conversations
      .filter((c) => partnerById.has(c._id.toString()))
      .map((c) => ({
        user: partnerById.get(c._id.toString()),
        lastMessage: c.lastMessage,
        unreadCount: c.unreadCount,
      }));

    res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, "Failed to fetch conversations.");
  }
};

export const getDirectMessages = async (req, res) => {
  const { senderId, receiverId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  if (!isValidObjectId(senderId) || !isValidObjectId(receiverId)) {
    return res.status(400).json({ message: "Invalid sender or receiver ID" });
  }

  if (req.user.id !== senderId && req.user.id !== receiverId) {
    return res.status(403).json({ message: "Not authorized to view this conversation" });
  }

  try {
    const messages = await DirectMessage.find({
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId }
      ],
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select("sender receiver content createdAt media type status");

    res.status(200).json(messages);
  } catch (error) {
    return sendError(res, error, "Failed to fetch messages.");
  }
};

export const searchDirectMessages = async (req, res) => {
  const { senderId, receiverId } = req.params;
  const { keyword, page = 1, limit = 20 } = req.query;

  if (!keyword) return res.status(400).json({ message: "Missing search keyword" });
  if (!isValidObjectId(senderId) || !isValidObjectId(receiverId)) {
    return res.status(400).json({ message: "Invalid user IDs" });
  }
  if (req.user.id !== senderId && req.user.id !== receiverId) {
    return res.status(403).json({ message: "Not authorized to search this conversation" });
  }

  try {
    const messages = await DirectMessage.find({
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId }
      ],
      isDeleted: false,
      content: { $regex: escapeRegex(keyword), $options: 'i' }
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select("sender receiver content media type createdAt");

    res.status(200).json(messages);
  } catch (error) {
    return sendError(res, error, "Failed to search messages.");
  }
};

export const uploadMedia = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const fileUrl = `${process.env.BASE_URL}/uploads/${req.file.filename}`;
  const mime = req.file.mimetype;

  let type = "file";
  if (mime.startsWith("image/")) type = "image";
  else if (mime.startsWith("video/")) type = "video";

  return res.status(200).json({
    url: fileUrl,
    type,
  });
};

export const markAsSeen = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await DirectMessage.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (message.receiver.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized action" });
    }

    if (message.status !== 'read') {
      message.status = 'read';
      message.readAt = new Date();
      await message.save();
    }

    return res.status(200).json({ message: "Message marked as seen" });
  } catch (error) {
    return sendError(res, error, "Failed to mark message as seen.");
  }
};


export const updateDirectMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { newContent } = req.body;
    const userId = req.user.id;

    const message = await DirectMessage.findById(messageId);

    if (!message || message.isDeleted) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (message.sender.toString() !== userId) {
      return res.status(403).json({ message: 'You are not allowed to edit this message' });
    }

    message.content = newContent;
    await message.save();

    return res.status(200).json({ message: 'Message updated', updatedMessage: message });
  } catch (error) {
    return sendError(res, error, "Failed to update message.");
  }
};



export const deleteDirectMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    const message = await DirectMessage.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (
      message.sender.toString() !== userId &&
      message.receiver.toString() !== userId
    ) {
      return res.status(403).json({ message: 'Not authorized to delete this message' });
    }

    message.isDeleted = true;
    await message.save();

    return res.status(200).json({ message: 'Message deleted' });
  } catch (error) {
    return sendError(res, error, "Failed to delete message.");
  }
};

export const sendDirectMessage = async (req, res) => {
  try {
    const { receiverId, content = "", media = null, type = "text" } = req.body;
    const senderId = req.user.id;

    if (!receiverId || (!content && !media)) {
      return res.status(400).json({ message: "Missing content or receiver" });
    }

    const newMessage = new DirectMessage({
      sender: senderId,
      receiver: receiverId,
      content,
      media,
      type,
      status: 'sent'
    });

    await newMessage.save();

    return res.status(201).json({ message: "Message sent", data: newMessage });
  } catch (error) {
    return sendError(res, error, "Failed to send message.");
  }
};

export const markConversationAsSeen = async (req, res) => {
  const { senderId } = req.params;
  const receiverId = req.user.id;

  try {
    const updated = await DirectMessage.updateMany(
      {
        sender: senderId,
        receiver: receiverId,
        status: { $ne: 'read' }
      },
      { $set: { status: 'read', readAt: new Date() } }
    );

    res.status(200).json({ message: "Conversation marked as seen", updatedCount: updated.modifiedCount });
  } catch (error) {
    return sendError(res, error, "Failed to mark conversation as seen.");
  }
};

export const reportDirectMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId, reason } = req.body;

    if (!messageId || !reason) {
      return res.status(400).json({ message: "Message ID and reason are required." });
    }

    const message = await DirectMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found." });
    }

    const report = new Report({
      type: "message",
      reportedBy: userId,
      targetMessage: messageId,
      targetMessageModel: "DirectMessage",
      reason,
    });

    await report.save();
    res.status(201).json({ message: "Message reported successfully." });
  } catch (error) {
    return sendError(res, error, "Failed to report message.");
  }
};

export const getUnreadMessages = async (req, res) => {
  const userId = req.user.id;

  try {
    const unread = await DirectMessage.find({
      receiver: userId,
      status: { $ne: 'read' },
      isDeleted: false,
    }).sort({ createdAt: -1 });

    res.status(200).json(unread);
  } catch (error) {
    return sendError(res, error, "Failed to fetch unread messages.");
  }
};

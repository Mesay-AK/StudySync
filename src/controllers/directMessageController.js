import DirectMessage from "../models/DirectMessage.js";
import { isValidObjectId } from "mongoose";

export const getDirectMessages = async (req, res) => {
  const { senderId, receiverId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  if (!isValidObjectId(senderId) || !isValidObjectId(receiverId)) {
    console.error("Invalid sender or receiver ID:", senderId, receiverId);
    return res.status(400).json({ error: "Invalid sender or receiver ID" });
  }

  try {
    const messages = await DirectMessage.find({
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId }
      ]
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("sender receiver content createdAt media type");

    res.status(200).json(messages);
  } catch (error) {
    console.error("Error fetching direct messages:", error);
    res.status(500).json({ error: "Error fetching direct messages" });
  }
};

export const searchDirectMessages = async (req, res) => {
  const { senderId, receiverId } = req.body;
  const { keyword, page = 1, limit = 20 } = req.query;

  if (!keyword) return res.status(400).json({ error: "Missing search keyword" });
  if (!isValidObjectId(senderId) || !isValidObjectId(receiverId)) {
    return res.status(400).json({ error: "Invalid user IDs" });
  }

  try {
    const messages = await DirectMessage.find({
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId }
      ],
      content: { $regex: keyword, $options: 'i' }
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("sender receiver content createdAt");

    res.status(200).json(messages);
  } catch (error) {
    console.error("Error searching direct messages:", error);
    res.status(500).json({ error: "Error searching direct messages" });
  }
};

export const uploadMedia = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
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
    const userId = req.user.id; // assuming you use auth middleware

    const message = await DirectMessage.findById(messageId);

    if (!message) {
      console.error("Message not found:", messageId);
      return res.status(404).json({ message: "Message not found" });
    }

    if (message.receiver.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized action" });
    }

    if (message.status !== 'read') {
      message.status = 'read';
      message.readAt = new Date(); // Optional: track when it was read
      await message.save();
    }

    return res.status(200).json({ message: "Message marked as seen" });
  } catch (error) {
    console.error("Error marking message as seen:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


export const updateDirectMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { newContent } = req.body;
    const userId = req.user.id; 

    const message = await DirectMessage.findById(messageId);

    if (!message) {
      console.error("Message not found:", messageId);
      return res.status(404).json({ message: 'Message not found' });
    }

    if (message.sender.toString() !== userId) {
      console.error("User not authorized to edit this message:", userId);
      return res.status(403).json({ message: 'You are not allowed to edit this message' });
    }

    message.content = newContent;


    await message.save();

    return res.status(200).json({ message: 'Message updated', updatedMessage: message });
  } catch (error) {
    console.error('Error updating direct message:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};



export const deleteDirectMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id; 
    const message = await DirectMessage.findById(messageId);

    if (!message) {
      console.error("Message not found:", messageId);
      return res.status(404).json({ message: 'Message not found' });
    }

    if (
      message.sender.toString() !== userId &&
      message.receiver.toString() !== userId
    ) {
      console.error("User not authorized to delete this message:", userId);
      return res.status(403).json({ message: 'Not authorized to delete this message' });
    }

    await message.deleteOne();

    return res.status(200).json({ message: 'Message deleted for both users' });
  } catch (error) {
    console.error('Error deleting direct message:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const sendDirectMessage = async (req, res) => {
  try {
    const { receiverId, content = "", media = null, type = "text" } = req.body;
    const senderId = req.user.id;

    if (!receiverId || (!content && !media)) {
      console.error("Missing content or receiver:", content, receiverId);
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
    console.error("Error sending direct message:", error);
    res.status(500).json({ message: "Internal server error" });
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
    console.error("Error marking conversation as seen:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getUnreadMessages = async (req, res) => {
  const userId = req.user.id;

  try {
    const unread = await DirectMessage.find({
      receiver: userId,
      status: { $ne: 'read' }
    }).sort({ createdAt: -1 });

    res.status(200).json(unread);
  } catch (error) {
    console.error("Error fetching unread messages:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

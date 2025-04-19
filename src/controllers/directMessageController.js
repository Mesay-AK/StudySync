import DirectMessage from "../models/DirectMessage.js";
import { isValidObjectId } from "mongoose";

export const getDirectMessages = async (req, res) => {
  const { senderId, receiverId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  if (!isValidObjectId(senderId) || !isValidObjectId(receiverId)) {
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
  const { senderId, receiverId } = req.params;
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

export const searchMessages = async (req, res) => {
  const { sender, receiver } = req.params;
  const { searchTerm } = req.query;

  if (!searchTerm) return res.status(400).json({ error: "Missing searchTerm" });

  try {
    const messages = await DirectMessage.find({
      $and: [
        {
          $or: [
            { sender, receiver },
            { sender: receiver, receiver: sender },
          ],
        },
        { content: { $regex: searchTerm, $options: "i" } },
      ],
    }).sort({ createdAt: -1 });

    res.status(200).json(messages);
  } catch (error) {
    console.error("Error searching messages:", error);
    res.status(500).json({ error: "Search failed" });
  }
};

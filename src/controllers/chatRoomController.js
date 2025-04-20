import ChatRoom from "../models/ChatRoom.js";
import Message from "../models/Message.js";
import { sendEmail } from "../utils/emailService.js";
import Report from "../models/Report.js";

export const getAllPublicRooms = async (req, res) => {
  try {
    const rooms = await ChatRoom.find({ type: "public" }).select("-invitedUsers"); // Hide invitedUsers for public rooms
    res.status(200).json(rooms);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
};

export const createRoom = async (req, res) => {
  const { name, type, creatorId, subject } = req.body;

  try {
    // Ensure creator is part of the new room
    const newRoom = new ChatRoom({
      name,
      type,
      members: [creatorId],
      subject, // Added subject to categorize rooms
    });

    const savedRoom = await newRoom.save();
    res.status(201).json(savedRoom);
  } catch (err) {
    res.status(500).json({ error: "Room creation failed" });
  }
};


export const joinPublicRoom = async (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room || room.type !== "public") {
      return res.status(404).json({ error: "Public room not found" });
    }

    // Avoid duplicate entry
    if (!room.members.includes(userId)) {
      room.members.push(userId);
      await room.save();
    }

    res.status(200).json({ message: "Joined public room successfully", room });
  } catch (err) {
    console.error("Error joining public room:", err);
    res.status(500).json({ error: "Failed to join public room" });
  }
};


export const joinPrivateRoom = async (req, res) => {
  const { roomId } = req.params;
  const { userId } = req.body;

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room || room.type !== "private" || !room.invitedUsers.includes(userId)) {
      return res.status(403).json({ error: "Not invited or invalid room" });
    }

    if (!room.members.includes(userId)) {
      room.members.push(userId);
      await room.save();
    }

    res.status(200).json({ message: "Joined private room successfully" });
  } catch (err) {
    res.status(500).json({ error: "Join failed" });
  }
};

export const inviteUsers = async (req, res) => {
  const { roomId } = req.params;
  const { userIds } = req.body;

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    // Add only new invitees (avoid duplicates)
    const newInvites = userIds.filter((id) => !room.invitedUsers.includes(id));
    room.invitedUsers.push(...newInvites);

    // Optionally, send an email notification to users invited
    const invitedUsers = await User.find({ _id: { $in: newInvites } }); // Assuming you have a User model
    invitedUsers.forEach((user) => {
      sendEmail({
        to: user.email,
        subject: `You're invited to join the room: ${room.name}`,
        html: `<p>You have been invited to join the room: <strong>${room.name}</strong></p>`,
      });
    });

    await room.save();
    res.status(200).json({ message: "Users invited successfully", room });
  } catch (err) {
    res.status(500).json({ error: "Invitation failed" });
  }
};

export const sendMessageToRoom = async (req, res) => {
  const { roomId } = req.params;
  const { sender, content } = req.body;

  try {
    const newMessage = new Message({ sender, chatRoomId: roomId, content });
    await newMessage.save();


    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ error: "Message sending failed" });
  }
};

export const getRoomMessages = async (req, res) => {
  const { roomId } = req.params;
  const { page = 1, limit = 20, userId } = req.query;

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const blockedUserIds = user.blockedUsers.map(id => id.toString());

    const messages = await Message.find({
      chatRoomId: roomId,
      sender: { $nin: blockedUserIds }, 
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json(messages);
  } catch (error) {
    console.error("getRoomMessages error:", error);
    res.status(500).json({ error: "Error fetching messages" });
  }
};


export const searchRoomMessages = async (req, res) => {
  const { roomId } = req.params;
  const { keyword, page = 1, limit = 20 } = req.query;

  try {
    const messages = await Message.find({
      chatRoomId: roomId,
      content: { $regex: keyword, $options: "i" }, // Case-insensitive search
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: "Error searching messages" });
  }
};



export const updateDMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { newContent } = req.body;
    const userId = req.user.id; 
    const Updatedmessage = await message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Only the sender can edit their message
    if (message.sender.toString() !== userId) {
      return res.status(403).json({ message: 'You are not allowed to edit this message' });
    }

    Updatedmessage.content = newContent;


    await Updatedmessage.save();

    return res.status(200).json({ message: 'Message updated', updatedMessage: message });
  } catch (error) {
    console.error('Error updating direct message:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};


export const deleteMessage = async (req, res) => {
  const { roomId, messageId } = req.params;
  const { userId } = req.body;

  try {
    if (userId !== message.sender) {
      return res.status(403).json({ error: "You are not authorized to delete this message" });
    }

    const room = await ChatRoom.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    const message = await Message.findOneAndDelete({ _id: messageId, chatRoomId: roomId });
    
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    res.status(200).json({ message: "Message deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Error deleting message" });
  }
};

export const deleteRoom = async (req, res) => {
  const { roomId } = req.params;

  try {
    const room = await ChatRoom.findByIdAndDelete(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.status(200).json({ message: "Room deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Error deleting room" });
  }
};



export const reportUser = async (req, res) => {
  try {
    const { userId } = req.params; // user doing the report
    const { targetUserId, reason } = req.body;

    if (!targetUserId || !reason) {
      return res.status(400).json({ message: "Target user and reason are required." });
    }

    const reportedUser = await User.findById(targetUserId);
    if (!reportedUser) {
      return res.status(404).json({ message: "User to report not found." });
    }

    const report = new Report({
      type: "user",
      reportedBy: userId,
      targetUser: targetUserId,
      reason,
    });

    await report.save();
    res.status(201).json({ message: "User reported successfully." });
  } catch (error) {
    console.error("Error reporting user:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};



export const reportMessage = async (req, res) => {
  try {
    const { userId } = req.params; // reporter
    const { messageId, reason } = req.body;

    if (!messageId || !reason) {
      return res.status(400).json({ message: "Message ID and reason are required." });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found." });
    }

    const report = new Report({
      type: "message",
      reportedBy: userId,
      targetMessage: messageId,
      reason,
    });

    await report.save();
    res.status(201).json({ message: "Message reported successfully." });
  } catch (error) {
    console.error("Error reporting message:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};
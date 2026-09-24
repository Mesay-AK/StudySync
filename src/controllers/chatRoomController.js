import ChatRoom from "../models/ChatRoom.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { sendEmail } from "../utils/emailService.js";
import Report from "../models/Report.js";
import { logActivity } from "../utils/activityLogger.js";
import { sendError } from "../utils/errorResponse.js";

export const getAllPublicRooms = async (req, res) => {
  try {
    const rooms = await ChatRoom.find({ type: "public", isDeleted: false }).select("-invitedUsers");
    res.status(200).json(rooms);
  } catch (error) {
    return sendError(res, error, "Failed to fetch rooms.");
  }
};

export const getMyRooms = async (req, res) => {
  try {
    const rooms = await ChatRoom.find({ members: req.user.id, isDeleted: false }).select("-invitedUsers");
    res.status(200).json(rooms);
  } catch (error) {
    return sendError(res, error, "Failed to fetch your rooms.");
  }
};

// Site-admin moderation view: every room, including private ones.
export const getAllRoomsAdmin = async (req, res) => {
  try {
    const rooms = await ChatRoom.find({ isDeleted: false })
      .populate("createdBy", "username displayName")
      .sort({ createdAt: -1 });
    res.status(200).json(rooms);
  } catch (error) {
    return sendError(res, error, "Failed to fetch rooms.");
  }
};

export const getRoomById = async (req, res) => {
  try {
    const room = await ChatRoom.findOne({ _id: req.params.roomId, isDeleted: false })
      .populate("members", "username displayName profilePicture onlineStatus")
      .populate("admins", "username displayName")
      .populate("createdBy", "username displayName");

    if (!room) return res.status(404).json({ message: "Room not found" });

    const userId = req.user.id;
    const isMember = room.members.some((m) => m._id.toString() === userId);
    const isInvited = room.invitedUsers?.some((id) => id.toString() === userId);

    if (room.type === "private" && !isMember && !isInvited && !req.user.isAdmin) {
      return res.status(403).json({ message: "This is a private room" });
    }

    const { invitedUsers, ...roomData } = room.toObject();
    res.status(200).json({
      ...roomData,
      invitedUsers: isMember ? invitedUsers : undefined,
      isMember,
      isAdmin: room.admins.some((a) => a._id.toString() === userId),
    });
  } catch (error) {
    return sendError(res, error, "Failed to fetch room.");
  }
};

export const createRoom = async (req, res) => {
  const { name, type, subject, description = "", maxParticipants = 50 } = req.body;
  const creatorId = req.user.id;

  try {
    const newRoom = new ChatRoom({
      name,
      type,
      members: [creatorId],
      admins: [creatorId],
      createdBy: creatorId,
      subject,
      description,
      maxParticipants,
    });

    const savedRoom = await newRoom.save();

    await logActivity({
      user: creatorId,
      type: "room_created",
      description: `Created the study room "${savedRoom.name}"`,
      metadata: { roomId: savedRoom._id },
    });

    res.status(201).json(savedRoom);
  } catch (error) {
    return sendError(res, error, "Failed to create room.");
  }
};


export const joinPublicRoom = async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room || room.isDeleted || room.type !== "public") {
      return res.status(404).json({ message: "Public room not found" });
    }

    if (!room.members.includes(userId) && room.members.length >= room.maxParticipants) {
      return res.status(409).json({ message: "This room is full" });
    }

    if (!room.members.includes(userId)) {
      room.members.push(userId);
      await room.save();
      await logActivity({
        user: userId,
        type: "room_joined",
        description: `Joined the study room "${room.name}"`,
        metadata: { roomId: room._id },
      });
    }

    res.status(200).json({ message: "Joined public room successfully", room });
  } catch (error) {
    return sendError(res, error, "Failed to join public room.");
  }
};


export const joinPrivateRoom = async (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room || room.isDeleted || room.type !== "private" || !room.invitedUsers.includes(userId)) {
      return res.status(403).json({ message: "Not invited or invalid room" });
    }

    if (!room.members.includes(userId) && room.members.length >= room.maxParticipants) {
      return res.status(409).json({ message: "This room is full" });
    }

    if (!room.members.includes(userId)) {
      room.members.push(userId);
      await room.save();
      await logActivity({
        user: userId,
        type: "room_joined",
        description: `Joined the study room "${room.name}"`,
        metadata: { roomId: room._id },
      });
    }

    res.status(200).json({ message: "Joined private room successfully", room });
  } catch (error) {
    return sendError(res, error, "Failed to join room.");
  }
};

export const inviteUsers = async (req, res) => {
  const { roomId } = req.params;
  const { userIds } = req.body;

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (!room.admins.some((adminId) => adminId.toString() === req.user.id)) {
      return res.status(403).json({ message: "Only room admins can invite users" });
    }

    const newInvites = (userIds || []).filter((id) => !room.invitedUsers.includes(id));
    room.invitedUsers.push(...newInvites);
    await room.save();

    const invitedUsers = await User.find({ _id: { $in: newInvites } });
    await Promise.all(
      invitedUsers.map((user) =>
        sendEmail({
          to: user.email,
          subject: `You're invited to join the room: ${room.name}`,
          html: `<p>You have been invited to join the room: <strong>${room.name}</strong></p>`,
        }).catch((err) => console.error(`Failed to email ${user.email}:`, err.message))
      )
    );

    res.status(200).json({ message: "Users invited successfully", room });
  } catch (error) {
    return sendError(res, error, "Failed to invite users.");
  }
};

export const sendMessageToRoom = async (req, res) => {
  const { roomId } = req.params;
  const { content } = req.body;
  const sender = req.user.id;

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room || room.isDeleted || !room.members.some((m) => m.toString() === sender)) {
      return res.status(403).json({ message: "You are not a member of this room" });
    }

    const newMessage = new Message({ sender, chatRoomId: roomId, content });
    await newMessage.save();

    res.status(201).json(newMessage);
  } catch (error) {
    return sendError(res, error, "Failed to send message.");
  }
};

export const getRoomMessages = async (req, res) => {
  const { roomId } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const userId = req.user.id;

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: "Room not found" });
    if (!room.members.some((m) => m.toString() === userId) && !req.user.isAdmin) {
      return res.status(403).json({ message: "You are not a member of this room" });
    }

    const user = await User.findById(userId);
    const blockedUserIds = user.blockedUsers.map((id) => id.toString());

    const messages = await Message.find({
      chatRoomId: roomId,
      sender: { $nin: blockedUserIds },
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate("sender", "username displayName");

    res.status(200).json(messages);
  } catch (error) {
    return sendError(res, error, "Failed to fetch messages.");
  }
};


export const searchRoomMessages = async (req, res) => {
  const { roomId } = req.params;
  const { keyword, page = 1, limit = 20 } = req.query;

  try {
    const messages = await Message.find({
      chatRoomId: roomId,
      isDeleted: false,
      content: { $regex: keyword, $options: "i" },
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate("sender", "username displayName");

    res.status(200).json(messages);
  } catch (error) {
    return sendError(res, error, "Failed to search messages.");
  }
};


export const updateRoomMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { newContent } = req.body;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (message.sender.toString() !== userId) {
      return res.status(403).json({ message: "You are not allowed to edit this message" });
    }

    message.content = newContent;
    await message.save();

    return res.status(200).json({ message: "Message updated", updatedMessage: message });
  } catch (error) {
    return sendError(res, error, "Failed to update message.");
  }
};


export const deleteMessage = async (req, res) => {
  const { roomId, messageId } = req.params;
  const userId = req.user.id;

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const message = await Message.findOne({ _id: messageId, chatRoomId: roomId });
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    const isSender = message.sender.toString() === userId;
    const isRoomAdmin = room.admins.some((adminId) => adminId.toString() === userId);
    if (!isSender && !isRoomAdmin && !req.user.isAdmin) {
      return res.status(403).json({ message: "You are not authorized to delete this message" });
    }

    message.isDeleted = true;
    await message.save();

    res.status(200).json({ message: "Message deleted successfully" });
  } catch (error) {
    return sendError(res, error, "Failed to delete message.");
  }
};

export const updateRoom = async (req, res) => {
  const { roomId } = req.params;
  const { name, description, subject, tags, type, maxParticipants } = req.body;

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room || room.isDeleted) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (!room.admins.some((adminId) => adminId.toString() === req.user.id) && !req.user.isAdmin) {
      return res.status(403).json({ message: "Only room admins can edit this room" });
    }

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ message: "Room name can't be empty" });
      room.name = name.trim();
    }
    if (description !== undefined) room.description = description;
    if (subject !== undefined) room.subject = subject;
    if (tags !== undefined) room.tags = tags;
    if (type !== undefined) {
      if (!["public", "private"].includes(type)) {
        return res.status(400).json({ message: "Type must be public or private" });
      }
      room.type = type;
    }
    if (maxParticipants !== undefined) {
      const max = Number(maxParticipants);
      if (!Number.isFinite(max) || max < room.members.length) {
        return res.status(400).json({ message: `Max participants can't be less than the current member count (${room.members.length})` });
      }
      room.maxParticipants = max;
    }

    await room.save();
    res.status(200).json(room);
  } catch (error) {
    return sendError(res, error, "Failed to update room.");
  }
};

export const deleteRoom = async (req, res) => {
  const { roomId } = req.params;

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (!room.admins.some((adminId) => adminId.toString() === req.user.id) && !req.user.isAdmin) {
      return res.status(403).json({ message: "Only room admins can delete this room" });
    }

    room.isDeleted = true;
    await room.save();

    res.status(200).json({ message: "Room deleted successfully" });
  } catch (error) {
    return sendError(res, error, "Failed to delete room.");
  }
};



export const leaveRoom = async (req, res) => {
    try {
        const { roomId } = req.body;
        const userId = req.user.id;
        const room = await ChatRoom.findById(roomId);

        if (!room) return res.status(404).json({ message: "Room not found" });

        room.members = room.members.filter(member => member.toString() !== userId);
        room.admins = room.admins.filter(admin => admin.toString() !== userId);
        await room.save();

        await logActivity({
          user: userId,
          type: "room_left",
          description: `Left the study room "${room.name}"`,
          metadata: { roomId: room._id },
        });

        res.status(200).json({ message: "Left room successfully", room });

    } catch (error) {
        return sendError(res, error, "Failed to leave room.");
    }
};

export const reportUser = async (req, res) => {
  try {
    const userId = req.user.id; // user doing the report
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
    return sendError(res, error, "Failed to report user.");
  }
};



export const reportMessage = async (req, res) => {
  try {
    const userId = req.user.id;
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
    return sendError(res, error, "Failed to report message.");
  }
};

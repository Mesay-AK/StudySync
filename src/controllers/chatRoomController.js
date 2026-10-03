import ChatRoom from "../models/ChatRoom.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { emailQueue } from "../queues/emailQueue.js";
import Report from "../models/Report.js";
import { isValidObjectId } from "mongoose";
import { logActivity } from "../utils/activityLogger.js";
import { sendError, errorBody } from "../utils/errorResponse.js";
import { escapeRegex } from "../utils/escapeRegex.js";
import { escapeHtml } from "../utils/escapeHtml.js";
import { clampPagination } from "../utils/pagination.js";
import { isNonEmptyString, isOptionalString, isStringArray } from "../utils/validation.js";
import { joinRoomAtomically, leaveRoomAtomically } from "../utils/roomMembership.js";
import { createAndSendNotification } from "../utils/socketHandlers/notificationHandlers.js";

const isMemberOf = (room, userId) => room.members.some((m) => m.toString() === userId);

// Shared by the REST join endpoints: maps joinRoomAtomically's outcome onto
// the response, and logs activity only for a genuinely new membership.
const respondToJoin = async (res, result, { userId, notFoundStatus, notFoundMessage, successMessage }) => {
  if (result.status === "not_found") return res.status(notFoundStatus).json({ message: notFoundMessage });
  if (result.status === "full") return res.status(409).json({ message: "This room is full" });

  if (result.status === "joined") {
    await logActivity({
      user: userId,
      type: "room_joined",
      description: `Joined the study room "${result.room.name}"`,
      metadata: { roomId: result.room._id, name: result.room.name },
    });
  }
  return res.status(200).json({ message: successMessage, room: result.room });
};

// Room-scoped duplicate reports are enforced by a partial unique index on
// Report; translate that into the same response the pre-check gives.
const isDuplicateReport = (error) => error?.code === 11000;

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

// Private rooms the caller has been invited to but hasn't joined yet - the
// only way an invitee can find the room (it's not in the public list, and
// they aren't a member yet).
export const getInvitedRooms = async (req, res) => {
  try {
    const rooms = await ChatRoom.find({
      type: "private",
      isDeleted: false,
      invitedUsers: req.user.id,
      members: { $ne: req.user.id },
    }).select("-invitedUsers");
    res.status(200).json(rooms);
  } catch (error) {
    return sendError(res, error, "Failed to fetch your invitations.");
  }
};

// Site-admin moderation view: every room, including private ones.
export const getAllRoomsAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", type = "" } = req.query;
    const { page: safePage, limit: safeLimit, skip } = clampPagination(page, limit);

    const query = { isDeleted: false };
    if (search) {
      const safeSearch = escapeRegex(search);
      query.name = { $regex: safeSearch, $options: "i" };
    }
    if (type === "public" || type === "private") query.type = type;

    // stats power the dashboard's summary cards, which represent the whole
    // platform, not whatever's currently searched/filtered - computed
    // independently of `query`/pagination so they stay accurate once the
    // table below only fetches one page at a time.
    const [total, publicCount, privateCount, memberTotals] = await Promise.all([
      ChatRoom.countDocuments(query),
      ChatRoom.countDocuments({ isDeleted: false, type: "public" }),
      ChatRoom.countDocuments({ isDeleted: false, type: "private" }),
      ChatRoom.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: null, totalMembers: { $sum: { $size: "$members" } } } },
      ]),
    ]);

    const rooms = await ChatRoom.find(query)
      .populate("createdBy", "username displayName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit);

    res.status(200).json({
      rooms,
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
      stats: {
        total: publicCount + privateCount,
        public: publicCount,
        private: privateCount,
        totalMembers: memberTotals[0]?.totalMembers || 0,
      },
    });
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
      // Lets the room page offer "Join" to an invitee of a private room.
      isInvited: Boolean(isInvited),
      isAdmin: room.admins.some((a) => a._id.toString() === userId),
    });
  } catch (error) {
    return sendError(res, error, "Failed to fetch room.");
  }
};

export const createRoom = async (req, res) => {
  const { name, type, subject, description = "", maxParticipants = 50, tags = [] } = req.body;
  const creatorId = req.user.id;

  try {
    if (!isNonEmptyString(name)) {
      return res.status(400).json({ message: "Room name is required" });
    }
    if (!isOptionalString(subject) || typeof description !== "string" || !isStringArray(tags)) {
      return res.status(400).json({ message: "Subject and description must be text, and tags a list of text" });
    }

    // The creator is added as the first member below, so the room must allow
    // at least 1 participant - an unvalidated 0/negative value here would
    // permanently brick the room (immediately "full") the moment it's created.
    const max = Number(maxParticipants);
    if (!Number.isFinite(max) || max < 1) {
      return res.status(400).json({ message: "Max participants must be a positive number" });
    }

    const newRoom = new ChatRoom({
      name: name.trim(),
      type,
      members: [creatorId],
      admins: [creatorId],
      createdBy: creatorId,
      subject,
      description,
      tags,
      maxParticipants: max,
    });

    const savedRoom = await newRoom.save();

    await logActivity({
      user: creatorId,
      type: "room_created",
      description: `Created the study room "${savedRoom.name}"`,
      metadata: { roomId: savedRoom._id, name: savedRoom.name },
    });

    res.status(201).json(savedRoom);
  } catch (error) {
    return sendError(res, error, "Failed to create room.");
  }
};


export const joinPublicRoom = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await joinRoomAtomically(req.params.roomId, userId, { type: "public" });
    return respondToJoin(res, result, {
      userId,
      notFoundStatus: 404,
      notFoundMessage: "Public room not found",
      successMessage: "Joined public room successfully",
    });
  } catch (error) {
    return sendError(res, error, "Failed to join public room.");
  }
};


export const joinPrivateRoom = async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await joinRoomAtomically(req.params.roomId, userId, { type: "private", invitedUsers: userId });
    return respondToJoin(res, result, {
      userId,
      notFoundStatus: 403,
      notFoundMessage: "Not invited or invalid room",
      successMessage: "Joined private room successfully",
    });
  } catch (error) {
    return sendError(res, error, "Failed to join room.");
  }
};

export const inviteUsers = async (req, res) => {
  const { roomId } = req.params;
  const { userIds } = req.body;

  try {
    if (!Array.isArray(userIds) || !userIds.every(isValidObjectId)) {
      return res.status(400).json({ message: "userIds must be a list of user IDs" });
    }

    const room = await ChatRoom.findOne({ _id: roomId, isDeleted: false });
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    if (!room.admins.some((adminId) => adminId.toString() === req.user.id)) {
      return res.status(403).json({ message: "Only room admins can invite users" });
    }

    // Only real accounts can be invited.
    const invitedUsers = await User.find({ _id: { $in: userIds } });
    const newInvites = invitedUsers.filter((u) => !room.invitedUsers.some((id) => id.equals(u._id)));

    const updated = await ChatRoom.findByIdAndUpdate(
      room._id,
      { $addToSet: { invitedUsers: { $each: newInvites.map((u) => u._id) } } },
      { new: true }
    );

    // The room name is user-controlled; unescaped, a room named like an
    // <a href> became a working link in an email sent from our domain.
    const safeName = escapeHtml(room.name);
    const roomLink = `${process.env.FRONTEND_URL}/user/room/${room._id}`;
    await Promise.all(
      newInvites.map((user) =>
        emailQueue.add("room-invite", {
          to: user.email,
          subject: `You're invited to join the room: ${room.name}`,
          html: `<p>You have been invited to join the room: <strong>${safeName}</strong></p><p><a href="${roomLink}">Open the room</a> to accept the invitation.</p>`,
        })
      )
    );

    // In-app notification too (invites used to be email-only, so nobody saw
    // them inside StudySync). Live if the invitee is online; skipped if they
    // blocked the inviter. Only for NEW invites - re-inviting doesn't repeat.
    await Promise.all(
      newInvites.map((user) =>
        createAndSendNotification({
          io: req.app.get("io"),
          type: "room_invite",
          recipientId: String(user._id),
          senderId: req.user.id,
          content: `You've been invited to join ${room.name}`,
          metadata: { roomId: String(room._id), roomName: room.name },
        })
      )
    );

    res.status(200).json({ message: "Users invited successfully", room: updated });
  } catch (error) {
    return sendError(res, error, "Failed to invite users.");
  }
};

export const sendMessageToRoom = async (req, res) => {
  const { roomId } = req.params;
  const { content } = req.body;
  const sender = req.user.id;

  try {
    if (!isNonEmptyString(content)) {
      return res.status(400).json({ message: "Message content is required" });
    }

    const room = await ChatRoom.findById(roomId);
    if (!room || room.isDeleted || !isMemberOf(room, sender)) {
      return res.status(403).json({ message: "You are not a member of this room" });
    }

    const newMessage = new Message({ sender, chatRoomId: roomId, content });
    await newMessage.save();

    res.status(201).json(newMessage);
  } catch (error) {
    return sendError(res, error, "Failed to send message.");
  }
};

// Shared by message history and search: rooms must exist and not be
// deleted (deleted rooms' messages used to stay readable), and the caller
// must be a member or a site admin. Resolves the room, or null after
// already sending the error response.
const loadReadableRoom = async (req, res) => {
  const room = await ChatRoom.findById(req.params.roomId);
  if (!room || room.isDeleted) {
    res.status(404).json({ message: "Room not found" });
    return null;
  }
  if (!isMemberOf(room, req.user.id) && !req.user.isAdmin) {
    res.status(403).json({ message: "You are not a member of this room" });
    return null;
  }
  return room;
};

export const getRoomMessages = async (req, res) => {
  const { roomId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  try {
    if (!(await loadReadableRoom(req, res))) return;

    const { limit: safeLimit, skip } = clampPagination(page, limit);
    const messages = await Message.find({
      chatRoomId: roomId,
      sender: { $nin: req.user.blockedUsers },
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate("sender", "username displayName");

    res.status(200).json(messages);
  } catch (error) {
    return sendError(res, error, "Failed to fetch messages.");
  }
};


export const searchRoomMessages = async (req, res) => {
  const { roomId } = req.params;
  const { keyword = "", page = 1, limit = 20 } = req.query;

  try {
    if (!(await loadReadableRoom(req, res))) return;

    const { limit: safeLimit, skip } = clampPagination(page, limit);
    const messages = await Message.find({
      chatRoomId: roomId,
      // Same block filtering as the history endpoint - search used to
      // surface messages from users the caller had blocked.
      sender: { $nin: req.user.blockedUsers },
      isDeleted: false,
      content: { $regex: escapeRegex(keyword), $options: "i" },
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
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

    if (typeof newContent !== "string") {
      return res.status(400).json({ message: "newContent is required" });
    }

    const message = await Message.findById(messageId);
    if (!message || message.isDeleted) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (message.sender.toString() !== userId) {
      return res.status(403).json({ message: "You are not allowed to edit this message" });
    }

    // A text-only message edited down to nothing would be an invisible ghost.
    if (!newContent.trim() && !message.media?.url) {
      return res.status(400).json({ message: "Message content can't be empty" });
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
    if (!isOptionalString(name) || !isOptionalString(description) || !isOptionalString(subject)) {
      return res.status(400).json({ message: "Name, description and subject must be text" });
    }
    if (tags !== undefined && !isStringArray(tags)) {
      return res.status(400).json({ message: "Tags must be a list of text" });
    }

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
        return res.status(400).json(errorBody(
          `Max participants can't be less than the current member count (${room.members.length})`,
          'MAX_BELOW_MEMBERS',
          { count: room.members.length }
        ));
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

        if (!(await ChatRoom.exists({ _id: roomId }))) return res.status(404).json({ message: "Room not found" });

        const room = await leaveRoomAtomically(roomId, userId);
        // Not a member: nothing to undo, and no "Left" activity to record.
        if (!room) return res.status(200).json({ message: "Left room successfully", room: await ChatRoom.findById(roomId) });

        await logActivity({
          user: userId,
          type: "room_left",
          description: `Left the study room "${room.name}"`,
          metadata: { roomId: room._id, name: room.name },
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

    if (!targetUserId || !isNonEmptyString(reason)) {
      return res.status(400).json({ message: "Target user and reason are required." });
    }

    const reportedUser = await User.findById(targetUserId);
    if (!reportedUser) {
      return res.status(404).json({ message: "User to report not found." });
    }

    const existingReport = await Report.findOne({
      type: "user",
      reportedBy: userId,
      targetUser: targetUserId,
      status: "pending",
    });
    if (existingReport) {
      return res.status(400).json({ message: "You have already reported this user." });
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
    if (isDuplicateReport(error)) return res.status(400).json({ message: "You have already reported this user." });
    return sendError(res, error, "Failed to report user.");
  }
};



export const reportMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { messageId, reason } = req.body;

    if (!messageId || !isNonEmptyString(reason)) {
      return res.status(400).json({ message: "Message ID and reason are required." });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found." });
    }

    const existingReport = await Report.findOne({
      type: "message",
      reportedBy: userId,
      targetMessage: messageId,
      targetMessageModel: "Message",
      status: "pending",
    });
    if (existingReport) {
      return res.status(400).json({ message: "You have already reported this message." });
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
    if (isDuplicateReport(error)) return res.status(400).json({ message: "You have already reported this message." });
    return sendError(res, error, "Failed to report message.");
  }
};

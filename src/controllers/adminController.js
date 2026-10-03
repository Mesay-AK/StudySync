// controllers/adminController.js
import User from "../models/User.js";
// import Message from "../models/Message.js";
import Report from "../models/Report.js";
import ChatRoom from "../models/ChatRoom.js";
import { hashPassword, isStrongPassword } from '../utils/passwordHelpers/password-helper.js';
import { sendError, errorBody } from '../utils/errorResponse.js';
import { validateNewAccount, normalizeEmail } from '../utils/validation.js';
import { disconnectUser } from '../utils/socketHandlers/safeOn.js';
import { purgeUserReferences } from './userController.js';
import { isValidObjectId } from 'mongoose';


export const registerAdmin = async (req, res) => {
  try {
    const { username, password, displayName } = req.body;

    const invalid = validateNewAccount({ username, email: req.body.email, password });
    if (invalid) return res.status(400).json({ message: invalid });
    const email = normalizeEmail(req.body.email);

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      const field = existingUser.email === email ? 'Email' : 'Username';
      return res.status(400).json(errorBody(`${field} already in use`, 'ALREADY_IN_USE', { field: field.toLowerCase() }));
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.' });
    }

    const newUser = new User({
      username,
      email,
      password: await hashPassword(password),
      displayName: typeof displayName === 'string' && displayName ? displayName : username,
      isAdmin: true,
    });

    await newUser.save();

    return res.status(201).json({ message: 'Admin registered successfully.' });
  } catch (error) {
    return sendError(res, error, 'Failed to register admin.');
  }
};

export const viewReports = async (req, res) => {
  try {
    const reports = await Report.find()
      .populate("reportedBy", "username email")
      .populate("targetUser", "username email")
      .populate("targetMessage")
      .sort({ createdAt: -1 });

    res.status(200).json({ reports });
  } catch (error) {
    return sendError(res, error, 'Failed to fetch reports.');
  }
};

export const resolveReport = async (req, res) => {
  const { reportId, action } = req.body;

  try {
    const report = await Report.findById(reportId).populate("targetMessage");
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    if (action === "deleteMessage" && report.targetMessage) {
      report.targetMessage.isDeleted = true;
      await report.targetMessage.save();
    }

    if (action === "banUser" && report.targetUser) {
      await User.findByIdAndUpdate(report.targetUser, { isBanned: true });
      disconnectUser(req.app.get("io"), report.targetUser);
    }

    report.status = "reviewed";
    await report.save();

    res.status(200).json({ message: "Report resolved" });
  } catch (error) {
    return sendError(res, error, 'Failed to resolve report.');
  }
};

// Ban or Unban user
export const toggleBanUser = async (req, res) => {
  const { userId, ban = true } = req.body;

  try {
    if (typeof ban !== "boolean") {
      return res.status(400).json({ message: "ban must be true or false." });
    }

    const user = await User.findByIdAndUpdate(userId, { isBanned: ban }, { new: true });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Socket auth only runs at handshake time - without this, a banned
    // user's already-open sockets kept sending messages.
    if (ban) disconnectUser(req.app.get("io"), user._id);

    res.status(200).json({ message: `User has been ${ban ? "banned" : "unbanned"}`, user });
  } catch (error) {
    return sendError(res, error, 'Failed to update ban status.');
  }
};

// Delete user (soft delete option)
export const deleteUser = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await user.deleteOne();
    await purgeUserReferences(req.app.get("io"), user._id);

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    return sendError(res, error, 'Failed to delete user.');
  }
};



// req.room is populated by the checkRoomAdmin middleware, which already
// verified the caller is an admin of this room - no need to re-check here.
export const promoteToRoomAdmin = async (req, res) => {
  const { userId } = req.body;
  const room = req.room;

  try {
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ message: "A valid userId is required" });
    }

    if (!room.members.some(memberId => memberId.toString() === userId)) {
      return res.status(400).json({ message: "User must be a member of the room to be promoted" });
    }

    if (room.admins.some(adminId => adminId.toString() === userId)) {
      return res.status(400).json({ message: "User is already an admin" });
    }

    room.admins.push(userId);
    await room.save();

    res.status(200).json({ message: "User promoted to room admin" });
  } catch (error) {
    return sendError(res, error, 'Failed to promote user.');
  }
};

export const demoteFromRoomAdmin = async (req, res) => {
  const { userId } = req.body;
  const room = req.room;

  try {
    const remainingAdmins = room.admins.filter(adminId => adminId.toString() !== userId);
    if (remainingAdmins.length === room.admins.length) {
      return res.status(400).json({ message: "User is not an admin of this room" });
    }
    if (remainingAdmins.length === 0) {
      return res.status(400).json({ message: "Cannot demote the last remaining admin of this room" });
    }

    room.admins = remainingAdmins;
    await room.save();

    res.status(200).json({ message: "User demoted from room admin" });
  } catch (error) {
    return sendError(res, error, 'Failed to demote user.');
  }
};

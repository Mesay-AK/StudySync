// controllers/adminController.js
import User from "../models/User.js";
// import Message from "../models/Message.js";
import Report from "../models/Report.js";
import ChatRoom from "../models/ChatRoom.js";
import { hashPassword, isStrongPassword } from '../utils/passwordHelpers/password-helper.js';


export const registerAdmin = async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      const field = existingUser.email === email ? 'Email' : 'Username';
      return res.status(400).json({ message: `${field} already in use` });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.' });
    }

    const newUser = new User({
      username,
      email,
      password: await hashPassword(password),
      displayName: displayName || username,
      isAdmin: true,
    });

    await newUser.save();

    return res.status(201).json({ message: 'Admin registered successfully.' });
  } catch (error) {
    console.error('Error registering admin:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const viewReports = async (req, res) => {
  try {
    const reports = await Report.find()
      .populate("reportedBy", "username email")
      .populate("targetUser", "username email")
      .populate("targetMessage")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, reports });
  } catch (err) {
    console.error("Error fetching reports:", err);
    res.status(500).json({ success: false, message: "Error fetching reports" });
  }
};

export const resolveReport = async (req, res) => {
  const { reportId, action } = req.body;

  try {
    const report = await Report.findById(reportId).populate("targetMessage");
    if (!report) {
      console.log("Report not found");
      return res.status(404).json({ success: false, message: "Report not found" });}

    if (action === "deleteMessage" && report.targetMessage) {
      report.targetMessage.isDeleted = true;
      await report.targetMessage.save();
    }

    if (action === "banUser" && report.targetUser) {
      await User.findByIdAndUpdate(report.targetUser, { isBanned: true });
    }

    report.status = "reviewed";
    await report.save();

    res.status(200).json({ success: true, message: "Report resolved" });
  } catch (err) {
    console.error("Error resolving report:", err);
    res.status(500).json({ success: false, message: "Error resolving report" });
  }
};

// Ban or Unban user
export const toggleBanUser = async (req, res) => {
  const { userId, ban = true } = req.body;

  try {
    const user = await User.findByIdAndUpdate(userId, { isBanned: ban }, { new: true });
    if (!user) {
      console.log("User not found");
      return res.status(404).json({ message: "User not found" });}

    res.status(200).json({ message: `User has been ${ban ? "banned" : "unbanned"}`, user });
  } catch (error) {
    res.status(500).json({ message: "Error updating ban status" });
  }
};

// Delete user (soft delete option)
export const deleteUser = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      console.log("User not found");
      return res.status(404).json({ message: "User not found" });}

    await user.deleteOne(); 

    res.status(200).json({ message: "User deleted successfully" });
  } catch {
    res.status(500).json({ message: "Error deleting user" });
  }
};



// req.room is populated by the checkRoomAdmin middleware, which already
// verified the caller is an admin of this room - no need to re-check here.
export const promoteToRoomAdmin = async (req, res) => {
  const { userId } = req.body;
  const room = req.room;

  if (room.admins.some(adminId => adminId.toString() === userId)) {
    console.log("User is already an admin");
    return res.status(400).json({ message: "User is already an admin" });
  }

  room.admins.push(userId);
  await room.save();

  res.status(200).json({ message: "User promoted to room admin" });
};

export const demoteFromRoomAdmin = async (req, res) => {
  const { userId } = req.body;
  const room = req.room;

  room.admins = room.admins.filter(adminId => adminId.toString() !== userId);
  await room.save();

  res.status(200).json({ message: "User demoted from room admin" });
};

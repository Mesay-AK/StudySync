// controllers/adminController.js
import User from "../models/User.js";
// import Message from "../models/Message.js";
import Report from "../models/Report.js";
import ChatRoom from "../models/ChatRoom.js";
import { hashPassword } from '../utils/passwordHelpers/password-helper.js';





export const registerAdmin = async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('Email already in use:', email);
      return res.status(400).json({ message: 'Email already in use' });
    }

  
    const passwordStrength = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+])[A-Za-z\d!@#$%^&*()_+]{8,}$/;
    if (!passwordStrength.test(password)) {
      console.log('Password is too weak:', password);
      return res.status(400).json({ message: 'Password is too weak' });
    }

    const hashedPassword = await hashPassword(password);
    if (!hashedPassword) {
      console.log('Error hashing password');
      return res.status(500).json({ message: 'Error hashing password' });   
    }
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      displayName: displayName || username,
      isAdmin: true,
    });

    await newUser.save();

    return res.status(201).json({ message: 'User registered successfully.' });
  } catch (error) {
    console.error('Error registering user:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const viewReports = async (req, res) => {
  try {
    const reports = await Report.find()
      .populate("reporter", "username email")
      .populate("reportedUser", "username email")
      .populate("reportedMessage");

    if (!reports || reports.length === 0) {
      console.log("No reports found");
      return res.status(404).json({ success: false, message: "No reports found" });
    }

    res.status(200).json({ success: true, reports });
  } catch (err) {
    console.error("Error fetching reports:", err);
    res.status(500).json({ success: false, message: "Error fetching reports" });
  }
};

export const resolveReport = async (req, res) => {
  const { reportId, action } = req.body;

  try {
    const report = await Report.findById(reportId).populate("reportedMessage");
    if (!report) {
      console.log("Report not found");
      return res.status(404).json({ success: false, message: "Report not found" });}

    if (action === "deleteMessage" && report.reportedMessage) {

      report.reportedMessage.isDeleted = true;
      await report.reportedMessage.save();
    }

    if (action === "banUser" && report.reportedUser) {
      await User.findByIdAndUpdate(report.reportedUser._id, { isBanned: true });
    }

    report.status = "reviewed";
    await report.save();

    res.status(200).json({ success: true, message: "Report resolved" });
  } catch (err) {
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



export const promoteToRoomAdmin = async (req, res) => {
  const { roomId, userId } = req.body;

  const room = await ChatRoom.findById(roomId);
  if (!room) {
    console.log("Room not found");
    return res.status(404).json({ message: "Room not found" });}

  if (!room.admins.includes(req.user._id)) {
    console.log("User is not a room admin");
    return res.status(403).json({ message: "You are not a room admin" });
  }

  if (room.admins.includes(userId)) {
    console.log("User is already an admin");
    return res.status(400).json({ message: "User is already an admin" });
  }

  room.admins.push(userId);
  await room.save();

  res.status(200).json({ message: "User promoted to room admin" });
};

export const demoteFromRoomAdmin = async (req, res) => {
  const { roomId, userId } = req.body;

  const room = await ChatRoom.findById(roomId);
  if (!room) {
    console.log("Room not found");
    return res.status(404).json({ message: "Room not found" });}

  if (!room.admins.includes(req.user._id)) {
    console.log("User is not a room admin");
    return res.status(403).json({ message: "You are not a room admin" });
  }

  room.admins = room.admins.filter(adminId => adminId.toString() !== userId);
  await room.save();

  res.status(200).json({ message: "User demoted from room admin" });
};

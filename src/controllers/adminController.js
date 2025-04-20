// controllers/adminController.js
import User from "../models/User.js";
// import Message from "../models/Message.js";
import Report from "../models/Report.js";
import ChatRoom from "../models/ChatRoom.js";


export const viewReports = async (req, res) => {
  try {
    const reports = await Report.find()
      .populate("reporter", "username email")
      .populate("reportedUser", "username email")
      .populate("reportedMessage");

    res.status(200).json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error fetching reports" });
  }
};

export const resolveReport = async (req, res) => {
  const { reportId, action } = req.body;

  try {
    const report = await Report.findById(reportId).populate("reportedMessage");
    if (!report) return res.status(404).json({ success: false, message: "Report not found" });

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
    if (!user) return res.status(404).json({ message: "User not found" });

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
    if (!user) return res.status(404).json({ message: "User not found" });

    await user.deleteOne(); // Replace with soft delete if needed
    res.status(200).json({ message: "User deleted successfully" });
  } catch {
    res.status(500).json({ message: "Error deleting user" });
  }
};

// Promote user to room admin
export const promoteToRoomAdmin = async (req, res) => {
  const { roomId, userId } = req.body;

  const room = await ChatRoom.findById(roomId);
  if (!room) return res.status(404).json({ message: "Room not found" });

  if (!room.admins.includes(req.user._id)) {
    return res.status(403).json({ message: "You are not a room admin" });
  }

  if (room.admins.includes(userId)) {
    return res.status(400).json({ message: "User is already an admin" });
  }

  room.admins.push(userId);
  await room.save();

  res.status(200).json({ message: "User promoted to room admin" });
};

export const demoteFromRoomAdmin = async (req, res) => {
  const { roomId, userId } = req.body;

  const room = await ChatRoom.findById(roomId);
  if (!room) return res.status(404).json({ message: "Room not found" });

  if (!room.admins.includes(req.user._id)) {
    return res.status(403).json({ message: "You are not a room admin" });
  }

  room.admins = room.admins.filter(adminId => adminId.toString() !== userId);
  await room.save();

  res.status(200).json({ message: "User demoted from room admin" });
};

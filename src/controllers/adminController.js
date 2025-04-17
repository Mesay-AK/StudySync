import User from "../models/User.js";
import Message from "../models/Message.js";
import Report from "../models/Report.js";

// View reports
export const viewReports = async (req, res) => {
  try {
    const reports = await Report.find().populate("reporter reportedUser");
    res.status(200).json({ success: true, reports });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error fetching reports" });
  }
};

// Resolve report
export const resolveReport = async (req, res) => {
  const { reportId, action } = req.body;

  try {
    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ success: false, message: "Report not found" });

    if (action === "deleteMessage" && report.type === "message") {
      const message = await Message.findById(report.contentId);
      if (message) {
        message.isDeleted = true;
        await message.save();
      }
    }

    if (action === "banUser" && report.type === "user") {
      await User.findByIdAndUpdate(report.contentId, { isBanned: true });
    }

    report.status = "resolved";
    await report.save();

    res.status(200).json({ success: true, message: "Report resolved" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error resolving report" });
  }
};

// Ban user
export const banUser = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findByIdAndUpdate(userId, { isBanned: true }, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ message: "User has been banned", user });
  } catch {
    res.status(500).json({ message: "Error banning user" });
  }
};

// Unban user
export const unbanUser = async (req, res) => {
  const { userId } = req.body;

  try {
    const user = await User.findByIdAndUpdate(userId, { isBanned: false }, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ message: "User has been unbanned", user });
  } catch {
    res.status(500).json({ message: "Error unbanning user" });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  const { userId } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    await user.deleteOne();
    res.status(200).json({ message: "User deleted successfully" });
  } catch {
    res.status(500).json({ message: "Error deleting user" });
  }
};




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

  const index = room.admins.indexOf(userId);
  if (index === -1) return res.status(400).json({ message: "User is not an admin" });

  room.admins.splice(index, 1);
  await room.save();

  res.status(200).json({ message: "User demoted from room admin" });
};
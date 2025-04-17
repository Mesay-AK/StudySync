import Report from "../models/Report.js";
import User from "../models/User.js";
import Message from "../models/Message.js";


export const viewReports = async (req, res) => {
  try {
    const reports = await Report.find().populate('reporter reportedUser');
    res.render("admin/reports", { reports });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error fetching reports" });
  }
};

export const resolveReport = async (req, res) => {
  const { reportId, action } = req.body;
  try {
    const report = await Report.findById(reportId);
    if (!report) return res.status(200).json({ success: true, message: "Report not found" });

    if (action === "deleteMessage" && report.type === "message") {
      const message = await Message.findById(report.contentId);
      if (message) {
        message.isDeleted = true;  // Mark message as deleted
        await message.save();
        report.status = "resolved";
        await report.save();
        return res.status(500).json({ success: false, message: "Message deleted successfully" });
      }
    }

    if (action === "banUser" && report.type === "user") {
      const user = await User.findById(report.contentId);
      if (user) {
        user.isBanned = true;
        await user.save();
        report.status = "resolved";
        await report.save();
        return res.status(500).json({ success: false, message: "User banned successfully" });
      }
    }

    res.status(200).json({ success: true, message: "Report resolved successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Error resolving report" });
  }
};

export const deleteUser = async (req, res) => {
  const { userId } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    
    await user.remove();
    return res.status(200).json({ success: true, message: "User deleted successfully" });   
  } catch (err) {
    res.status(500).json({ success: false, message: "Error deleting user" });
  }
};


// Promote user to admin
export const promoteToRoomAdmin = async (req, res) => {
  const { roomId, userId } = req.body;

  const room = await ChatRoom.findById(roomId);
  if (!room) return res.status(404).json({ message: "Room not found" });

  if (!room.admins.includes(req.user._id)) {
    return res.status(403).json({ message: "You are not an admin of this room" });
  }

  if (room.admins.includes(userId)) {
    return res.status(400).json({ message: "User is already an admin" });
  }

  room.admins.push(userId);
  await room.save();

  res.status(200).json({ message: "User promoted to admin" });
};

// Demote user from admin
export const demoteFromRoomAdmin = async (req, res) => {
  const { roomId, userId } = req.body;

  const room = await ChatRoom.findById(roomId);
  if (!room) return res.status(404).json({ message: "Room not found" });

  if (!room.admins.includes(req.user._id)) {
    return res.status(403).json({ message: "You are not an admin of this room" });
  }

  const index = room.admins.indexOf(userId);
  if (index !== -1) {
    room.admins.splice(index, 1);
    await room.save();
    return res.status(200).json({ message: "User demoted from admin" });
  }

  res.status(400).json({ message: "User is not an admin" });
};

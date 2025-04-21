import ChatRoom from "../models/ChatRoom.js";

export const checkRoomAdmin = async (req, res, next) => {
  const userId = req.userId; 
  const roomId = req.params.roomId || req.body.roomId;

  if (!roomId) {
    return res.status(400).json({ message: "Room ID is required." });
  }

  try {
    const room = await ChatRoom.findById(roomId);

    if (!room || room.isDeleted) {
      return res.status(404).json({ message: "Chat room not found." });
    }

    const isAdmin = room.admins.some(adminId => adminId.toString() === userId);

    if (!isAdmin) {
      return res.status(403).json({ message: "You are not an admin of this room." });
    }

    req.room = room;
    next();
  } catch (error) {
    console.error("Room admin check error:", error.message);
    res.status(500).json({ message: "Server error while verifying admin status." });
  }
};


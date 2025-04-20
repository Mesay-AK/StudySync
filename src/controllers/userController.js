// UserController.js
import ChatRoom from "../models/ChatRoom.js";
import Message from "../models/Message.js";
import { isValidObjectId } from "mongoose";

export const getAllPublicRooms = async (req, res) => {
  try {
    const rooms = await ChatRoom.find({ type: "public", isDeleted: false })
      .select("name type members createdBy")
      .lean();

    const roomsWithCount = rooms.map(room => ({
      ...room,
      participantCount: room.members.length
    }));

    res.status(200).json(roomsWithCount);
  } catch (err) {
    console.error("Error fetching public rooms:", err);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
};

export const createRoom = async (req, res) => {
  const { name, type, creatorId } = req.body;

  if (!name || !creatorId || !["public", "private"].includes(type)) {
    return res.status(400).json({ error: "Missing or invalid parameters" });
  }

  try {
    const newRoom = new ChatRoom({
      name,
      type,
      createdBy: creatorId,
      members: [creatorId],
      admins: [creatorId],
    });

    const savedRoom = await newRoom.save();
    res.status(201).json(savedRoom);
  } catch (err) {
    console.error("Error creating room:", err);
    res.status(500).json({ error: "Room creation failed" });
  }
};

export const joinPublicRoom = async (req, res) => {
  const { roomId, userId } = req.body;

  if (!roomId || !userId || !isValidObjectId(roomId)) {
    return res.status(400).json({ error: "Invalid data" });
  }

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room || room.type !== "public") {
      return res.status(404).json({ error: "Room not found or not public" });
    }

    if (!room.members.includes(userId)) {
      room.members.push(userId);
      await room.save();
    }

    res.status(200).json({ message: "Joined public room", room });
  } catch (err) {
    console.error("Error joining public room:", err);
    res.status(500).json({ error: "Join failed" });
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

    res.status(200).json({ message: "Joined private room" });
  } catch (err) {
    console.error("Error joining private room:", err);
    res.status(500).json({ error: "Join failed" });
  }
};

export const inviteUsers = async (req, res) => {
  const { roomId } = req.params;
  const { userIds, requesterId } = req.body;

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    if (!room.admins.includes(requesterId)) {
      return res.status(403).json({ error: "Only admins can invite users" });
    }

    const newInvites = userIds.filter((id) => !room.invitedUsers.includes(id));
    room.invitedUsers.push(...newInvites);
    await room.save();

    res.status(200).json(room);
  } catch (err) {
    console.error("Error inviting users:", err);
    res.status(500).json({ error: "Invitation failed" });
  }
};

export const leaveRoom = async (req, res) => {
  const { roomId, userId } = req.body;

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    room.members = room.members.filter((member) => member.toString() !== userId);
    await room.save();

    res.status(200).json({ message: "Left room" });
  } catch (err) {
    console.error("Error leaving room:", err);
    res.status(500).json({ error: "Failed to leave room" });
  }
};

export const deleteRoom = async (req, res) => {
  const { roomId } = req.params;
  const { requesterId } = req.body;

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    if (!room.admins.includes(requesterId)) {
      return res.status(403).json({ error: "Only admins can delete room" });
    }

    room.isDeleted = true;
    await room.save();

    res.status(200).json({ message: "Room marked as deleted" });
  } catch (err) {
    console.error("Error deleting room:", err);
    res.status(500).json({ error: "Delete failed" });
  }
};

export const getRoomMessages = async (req, res) => {
  const { roomId } = req.params;

  try {
    const messages = await Message.find({ chatRoomId: roomId })
      .sort({ createdAt: 1 })
      .select("sender content createdAt");
    res.status(200).json(messages);
  } catch (err) {
    console.error("Error fetching room messages:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};


export const blockUser = async (req, res) => {
  try {
    const { userId } = req.params; // ID of the user doing the blocking
    const { blockedUserId } = req.body; // ID of the user to block

    if (userId === blockedUserId) {
      return res.status(400).json({ message: "You cannot block yourself." });
    }

    const user = await User.findById(userId);
    const blockedUser = await User.findById(blockedUserId);

    if (!user || !blockedUser) {
      return res.status(404).json({ message: "User not found." });
    }

    if (user.blockedUsers.includes(blockedUserId)) {
      return res.status(400).json({ message: "User is already blocked." });
    }

    user.blockedUsers.push(blockedUserId);
    await user.save();

    res.status(200).json({ message: "User blocked successfully." });
  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};



export const getBlockedUsers = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId).populate("blockedUsers", "username email profilePicture");

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({ blockedUsers: user.blockedUsers });
  } catch (error) {
    console.error("Error fetching blocked users:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};


export const unBlockUser = async (req, res) => {
  const { userId } = req.params;       
  const { unblockUserId } = req.body;   

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.blockedUsers = user.blockedUsers.filter(
      (id) => id.toString() !== unblockUserId
    );

    await user.save();

    res.status(200).json({ message: "User unblocked successfully." });
  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({ message: "Internal server error." });
  }
};

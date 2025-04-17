import ChatRoom from "../models/ChatRoom.js";
import Message from "../models/Message.js";

export const getAllPublicRooms = async (req, res) => {
  try {
    const rooms = await ChatRoom.find({ type: "public" });
    res.status(200).json(rooms);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
};

export const createRoom = async (req, res) => {
  const { name, type, creatorId } = req.body;

  try {
    const newRoom = new ChatRoom({
      name,
      type,
      members: [creatorId],
    });

    const savedRoom = await newRoom.save();
    res.status(201).json(savedRoom);
  } catch (err) {
    res.status(500).json({ error: "Room creation failed" });
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
    res.status(500).json({ error: "Join failed" });
  }
};

export const inviteUsers = async (req, res) => {
  const { roomId } = req.params;
  const { userIds } = req.body;

  try {
    const room = await ChatRoom.findById(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    const newInvites = userIds.filter((id) => !room.invitedUsers.includes(id));
    room.invitedUsers.push(...newInvites);
    await room.save();

    res.status(200).json(room);
  } catch (err) {
    res.status(500).json({ error: "Invitation failed" });
  }
};

export const sendMessageToRoom = async (req, res) => {
  const { roomId } = req.params;
  const { sender, content } = req.body;

  try {
    const newMessage = new Message({ sender, chatRoomId: roomId, content });
    await newMessage.save();

    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ error: "Message failed" });
  }
};


export const getRoomMessages = async (req, res) => {
  const { roomId } = req.params;
  const { page = 1, limit = 20 } = req.query;  

  try {
    const messages = await Message.find({ chatRoomId: roomId })
      .sort({ createdAt: -1 })  
      .skip((page - 1) * limit)  
      .limit(limit);

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching messages' });
  }
};


export const searchRoomMessages = async (req, res) => {
  const { roomId } = req.params;
  const { keyword, page = 1, limit = 20 } = req.query;

  try {
    const messages = await Message.find({ 
      chatRoomId: roomId, 
      content: { $regex: keyword, $options: 'i' }  // Case-insensitive search
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Error searching messages' });
  }
};
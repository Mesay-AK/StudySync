import ChatRoom from "../models/ChatRoom.js";
import Message from "../models/Message.js"; // Import Message model for fetching messages

// Create Public Room
const createRoom = async (req, res) => {
    try {
        const { name, type, creatorId } = req.body;
        const newRoom = new ChatRoom({
            name,
            type: type || "public", // Default to public
            createdBy: creatorId,
            members: [creatorId],
            admins: [creatorId],
        });

        await newRoom.save();
        res.status(201).json(newRoom);
    } catch (error) {
        console.error("Error creating chat room:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Create Private Room
const createPrivateRoom = async (req, res) => {
    try {
        const { name, creatorId, invitedUsers } = req.body;
        const newRoom = new ChatRoom({
            name,
            type: "private",
            createdBy: creatorId,
            members: [creatorId],
            admins: [creatorId],
            invitedUsers,
        });

        await newRoom.save();
        res.status(201).json(newRoom);
    } catch (error) {
        console.error("Error creating private chat room:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Get Public Chat Rooms
const getChatRooms = async (req, res) => {
    try {
        const rooms = await ChatRoom.find({ type: "public" });
        res.status(200).json({ rooms });
    } catch (error) {
        console.error("Error fetching chat rooms:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Join Public Room
const joinPublicRoom = async (req, res) => {
    try {
        const { userId, roomId } = req.body;
        const room = await ChatRoom.findById(roomId);

        if (!room) return res.status(404).json({ message: "Room not found" });

        if (!room.members.includes(userId)) {
            room.members.push(userId);
            await room.save();
        }
        res.status(200).json({ message: "Joined room successfully", room });

    } catch (error) {
        console.error("Error joining chat room:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Join Private Room
const joinPrivateRoom = async (req, res) => {
    try {
        const { userId, roomId } = req.body;
        const room = await ChatRoom.findById(roomId);

        if (!room) return res.status(404).json({ message: "Room not found" });

        if (room.type === "private" && !room.invitedUsers.includes(userId)) {
            return res.status(403).json({ error: "You are not invited to this room" });
        }

        if (!room.members.includes(userId)) {
            room.members.push(userId);
            await room.save();
        }
        res.status(200).json({ message: "Joined room successfully", room });

    } catch (error) {
        console.error("Error joining chat room:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Invite Users to Private Room
const inviteUsers = async (req, res) => {
    try {
        const { roomId, adminId, invitedUsers } = req.body;
        const room = await ChatRoom.findById(roomId);

        if (!room) return res.status(404).json({ message: "Room not found" });

        if (!room.admins.includes(adminId)) {
            return res.status(403).json({ error: "Only admins can invite users" });
        }

        room.invitedUsers.push(...invitedUsers);
        await room.save();

        res.status(200).json({ message: "Users invited successfully", room });

    } catch (error) {
        console.error("Error inviting users:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Leave Room
const leaveRoom = async (req, res) => {
    try {
        const { userId, roomId } = req.body;
        const room = await ChatRoom.findById(roomId);

        if (!room) return res.status(404).json({ message: "Room not found" });

        room.members = room.members.filter(member => member.toString() !== userId);
        await room.save();

        res.status(200).json({ message: "Left room successfully", room });

    } catch (error) {
        console.error("Error leaving chat room:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Delete Room
const deleteRoom = async (req, res) => {
    try {
        const { roomId } = req.params;
        const room = await ChatRoom.findById(roomId);

        if (!room) return res.status(404).json({ message: "Room not found" });

        await room.deleteOne();
        res.status(200).json({ message: "Room deleted successfully" });

    } catch (error) {
        console.error("Error deleting chat room:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Get Room Messages
const getRoomMessages = async (req, res) => {
    try {
        const { roomId } = req.params;
        const messages = await Message.find({ chatRoomId: roomId }).sort({ createdAt: 1 });

        if (!messages.length) return res.status(404).json({ message: "No messages found" });

        res.status(200).json({ messages });

    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Search Messages in a Chat Room
const searchRoomMessages = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { keyword } = req.query;

        const messages = await Message.find({
            chatRoomId: roomId,
            content: { $regex: keyword, $options: "i" }
        }).sort({ createdAt: -1 });

        res.status(200).json({ messages });
    } catch (error) {
        console.error("Error searching messages:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export { createRoom, createPrivateRoom, getChatRooms, joinPublicRoom, joinPrivateRoom, inviteUsers, leaveRoom, deleteRoom, getRoomMessages, searchRoomMessages };

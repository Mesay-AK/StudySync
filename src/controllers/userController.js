import { usersOnline } from "../utils/socketHandlers/userHandlers.js";
import User from "../models/User.js";


export const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



export const updateUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    const allowedUpdates = [
      "displayName",
      "bio",
      "profilePicture",
      "email",
      "username",
      "onlineStatus"
    ];

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    for (let key of allowedUpdates) {
      if (updates[key] !== undefined) {
        user[key] = updates[key];
      }
    }

    if (updates.email && updates.email !== user.email) {
      const existing = await User.findOne({ email: updates.email });
      if (existing) return res.status(400).json({ message: "Email already in use" });
    }

    if (updates.username && updates.username !== user.username) {
      const existing = await User.findOne({ username: updates.username });
      if (existing) return res.status(400).json({ message: "Username already in use" });
    }

    await user.save();
    res.status(200).json(user);
  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};




export const deleteProfile = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findByIdAndDelete(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ message: "User profile deleted successfully" });
  } catch (error) {
    console.error("Error deleting user profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



export const getUserStatus = (req, res) => {
  try {
    const { userId } = req.params;
    const isOnline = [...usersOnline.values()].includes(userId);
    res.status(200).json({ userId, onlineStatus: isOnline ? "online" : "offline" });
  } catch (error) {
    console.error("Error fetching user status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



export const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { onlineStatus } = req.body;

    const allowedStatuses = ["online", "offline", "away", "busy"];
    if (!allowedStatuses.includes(onlineStatus)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.onlineStatus = onlineStatus;
    await user.save();

    res.status(200).json({ userId, onlineStatus: user.onlineStatus });
  } catch (error) {
    console.error("Error updating user status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



export const blockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { targetUserId } = req.body;

    if (!targetUserId) return res.status(400).json({ message: "Target user ID is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.blockedUsers.includes(targetUserId)) {
      return res.status(400).json({ message: "User already blocked" });
    }

    user.blockedUsers.push(targetUserId);
    await user.save();

    res.status(200).json({ message: "User blocked successfully", blockedUsers: user.blockedUsers });
  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



export const getBlockedUsers = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select("blockedUsers").populate("blockedUsers", "-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json(user.blockedUsers);
  }
  catch (error) {
    console.error("Error fetching blocked users:", error);
    res.status(500).json({ message: "Internal server error" });
  }

}



export const unblockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { targetUserId } = req.body;

    if (!targetUserId) return res.status(400).json({ message: "Target user ID is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.blockedUsers.includes(targetUserId)) {
      return res.status(400).json({ message: "User not blocked" });
    }

    user.blockedUsers = user.blockedUsers.filter(id => id.toString() !== targetUserId);
    await user.save();

    res.status(200).json({ message: "User unblocked successfully", blockedUsers: user.blockedUsers });
  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}


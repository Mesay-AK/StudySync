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


export const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ message: "Query is required" });

    const users = await User.find({
      $or: [
        { username: { $regex: query, $options: "i" } },
        { displayName: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } }

      ]
    }).select("-password");

    res.status(200).json(users);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getUserSettings = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select("settings");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json(user.settings);
  }
  catch (error) {
    console.error("Error fetching user settings:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}


export const updateUserSettings = async (req, res) => {
  try {
    const { userId } = req.params;
    const { settings } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.settings = { ...user.settings, ...settings };
    await user.save();

    res.status(200).json(user.settings);
  }catch (error) {
    console.error("Error updating user settings:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}


export const getUserFriends = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).populate("friends", "-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json(user.friends);
  } catch (error) {
    console.error("Error fetching user friends:", error);
    res.status(500).json({ message: "Internal server error" });
  }
} 

export const addFriend = async (req, res) => {
  try {
    const { userId } = req.params;
    const { friendId } = req.body;

    if (!friendId) return res.status(400).json({ message: "Friend ID is required" });

    const user = await User.findById(userId);
    const friend = await User.findById(friendId);

    if (!user || !friend) return res.status(404).json({ message: "User or friend not found" });

    if (user.friends.includes(friendId)) {
      return res.status(400).json({ message: "Already friends" });
    }

    user.friends.push(friendId);
    await user.save();

    res.status(200).json({ message: "Friend added successfully", friends: user.friends });
  } catch (error) {
    console.error("Error adding friend:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export const removeFriend = async (req, res) => {
  try {
    const { userId } = req.params;
    const { friendId } = req.body;

    if (!friendId) return res.status(400).json({ message: "Friend ID is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.friends.includes(friendId)) {
      return res.status(400).json({ message: "Not friends" });
    }

    user.friends = user.friends.filter(id => id.toString() !== friendId);
    await user.save();

    res.status(200).json({ message: "Friend removed successfully", friends: user.friends });
  } catch (error) {
    console.error("Error removing friend:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export const getUserNotifications = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select("notifications");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json(user.notifications);
  }
  catch (error) {
    console.error("Error fetching user notifications:", error);
    res.status(500).json({ message: "Internal server error" });
  } 

export const markNotificationAsRead = async (req, res) => { 
  try {
    const { userId } = req.params;
    const { notificationId } = req.body;

    if (!notificationId) return res.status(400).json({ message: "Notification ID is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const notification = user.notifications.id(notificationId);
    if (!notification) return res.status(404).json({ message: "Notification not found" });

    notification.isRead = true;
    await user.save();

    res.status(200).json({ message: "Notification marked as read", notifications: user.notifications });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}
}

export const deleteNotification = async (req, res) => {
  try {
    const { userId } = req.params;
    const { notificationId } = req.body;

    if (!notificationId) return res.status(400).json({ message: "Notification ID is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.notifications = user.notifications.filter(id => id.toString() !== notificationId);
    await user.save();

    res.status(200).json({ message: "Notification deleted successfully", notifications: user.notifications });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}
export const clearNotifications = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    
    user.notifications = [];
    await user.save();

    res.status(200).json({ message: "Notifications cleared successfully" });
  } catch (error) {
    console.error("Error clearing notifications:", error);
    res.status(500).json({ message: "Internal server error" });
  } 

}


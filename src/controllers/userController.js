import { usersOnline } from "../utils/socketHandlers/userHandlers.js";
import User from "../models/User.js";
import { sendError } from "../utils/errorResponse.js";
import { escapeRegex } from "../utils/escapeRegex.js";
import { clampPagination } from "../utils/pagination.js";


export const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json(user);
  } catch (error) {
    return sendError(res, error, "Failed to fetch user profile.");
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
    return sendError(res, error, "Failed to update user profile.");
  }
};



export const deleteProfile = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findByIdAndDelete(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ message: "User profile deleted successfully" });
  } catch (error) {
    return sendError(res, error, "Failed to delete user profile.");
  }
};



export const getUserStatus = (req, res) => {
  try {
    const { userId } = req.params;
    const isOnline = [...usersOnline.values()].includes(userId);
    res.status(200).json({ userId, onlineStatus: isOnline ? "online" : "offline" });
  } catch (error) {
    return sendError(res, error, "Failed to fetch user status.");
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
    return sendError(res, error, "Failed to update user status.");
  }
};



export const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", role = "", status = "", sortBy = "name" } = req.query;
    const { page: safePage, limit: safeLimit, skip } = clampPagination(page, limit);

    const query = {};
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { username: { $regex: safeSearch, $options: "i" } },
        { displayName: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
      ];
    }
    if (role === "admin") query.isAdmin = true;
    else if (role === "student") query.isAdmin = false;
    if (status === "banned") query.isBanned = true;
    else if (status === "online") query.onlineStatus = "online";
    else if (status === "offline") query.onlineStatus = "offline";

    const sortMap = {
      name: { displayName: 1, username: 1 },
      date: { createdAt: -1 },
      status: { onlineStatus: 1 },
    };

    // stats power the dashboard's summary cards, which represent the whole
    // platform, not whatever's currently searched/filtered - computed
    // independently of `query`/pagination so they stay accurate once the
    // table below only fetches one page at a time.
    const [total, statsTotal, banned, admins, online] = await Promise.all([
      User.countDocuments(query),
      User.countDocuments(),
      User.countDocuments({ isBanned: true }),
      User.countDocuments({ isAdmin: true }),
      User.countDocuments({ onlineStatus: "online" }),
    ]);

    const users = await User.find(query)
      .select("-password")
      .sort(sortMap[sortBy] || sortMap.name)
      .skip(skip)
      .limit(safeLimit);

    res.status(200).json({
      users,
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
      stats: { total: statsTotal, banned, admins, online },
    });
  } catch (error) {
    return sendError(res, error, "Failed to fetch users.");
  }
};



export const blockUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const { targetUserId } = req.body;

    if (!targetUserId) return res.status(400).json({ message: "Target user ID is required" });
    if (targetUserId === userId) return res.status(400).json({ message: "You cannot block yourself" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.blockedUsers.includes(targetUserId)) {
      return res.status(400).json({ message: "User already blocked" });
    }

    user.blockedUsers.push(targetUserId);
    await user.save();

    res.status(200).json({ message: "User blocked successfully", blockedUsers: user.blockedUsers });
  } catch (error) {
    return sendError(res, error, "Failed to block user.");
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
    return sendError(res, error, "Failed to fetch blocked users.");
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
    return sendError(res, error, "Failed to unblock user.");
  }
}


export const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ message: "Query is required" });

    const safeQuery = escapeRegex(query);
    const users = await User.find({
      $or: [
        { username: { $regex: safeQuery, $options: "i" } },
        { displayName: { $regex: safeQuery, $options: "i" } },
        { email: { $regex: safeQuery, $options: "i" } }

      ]
    }).select("-password");

    res.status(200).json(users);
  } catch (error) {
    return sendError(res, error, "Failed to search users.");
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
    return sendError(res, error, "Failed to fetch settings.");
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
    return sendError(res, error, "Failed to update settings.");
  }
}



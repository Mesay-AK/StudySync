import { isUserOnline } from "../utils/socketHandlers/userHandlers.js";
import User from "../models/User.js";
import { sendError, errorBody } from "../utils/errorResponse.js";
import { escapeRegex } from "../utils/escapeRegex.js";
import { clampPagination } from "../utils/pagination.js";
import { isValidObjectId } from "mongoose";
import { removeUserFromAllRooms } from "../utils/roomMembership.js";
import { disconnectUser } from "../utils/socketHandlers/safeOn.js";
import { normalizeEmail } from "../utils/validation.js";
import { SUPPORTED_LANGUAGES, PROFILE_VISIBILITY } from "../models/User.js";
import ChatRoom from "../models/ChatRoom.js";
import DirectMessage from "../models/DirectMessage.js";
import Material from "../models/Material.js";

// What any logged-in user may see about someone else. Email, block list,
// settings and admin/ban flags used to be returned to everyone by profile and
// search lookups.
export const PUBLIC_USER_FIELDS = "username displayName profilePicture bio onlineStatus lastSeen createdAt";

// The minimum anyone logged in can see about anyone - what chats, member
// lists and search results need. Everything else in PUBLIC_USER_FIELDS is
// subject to the owner's profileVisibility setting.
export const CARD_FIELDS = "username displayName profilePicture onlineStatus";

// "connections": people who share a (non-deleted) room or have exchanged a
// direct message.
const areConnected = async (a, b) =>
  Boolean(
    (await ChatRoom.exists({ isDeleted: false, members: { $all: [a, b] } })) ||
    (await DirectMessage.exists({
      isDeleted: false,
      $or: [{ sender: a, receiver: b }, { sender: b, receiver: a }],
    }))
  );

const canSeeFullProfile = async (viewer, target) => {
  // Someone who blocked you looks exactly like a private profile - the
  // response must not reveal the block.
  if (target.blockedUsers?.some((id) => id.equals(viewer._id))) return false;
  const visibility = target.settings?.profileVisibility ?? "connections";
  if (visibility === "everyone") return true;
  if (visibility === "connections") return areConnected(viewer._id, target._id);
  return false;
};

// Account deletion used to leave the user listed in rooms' members/admins
// (possibly leaving a room with no admin) and in other users' block lists,
// and their open sockets connected.
export const purgeUserReferences = async (io, userId) => {
  await removeUserFromAllRooms(userId);
  await User.updateMany({ blockedUsers: userId }, { $pull: { blockedUsers: userId } });
  disconnectUser(io, userId);
};


export const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const isSelfOrAdmin = req.user.id === userId || req.user.isAdmin;
    if (isSelfOrAdmin) {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      return res.status(200).json(user);
    }

    const target = await User.findById(userId).select(`${PUBLIC_USER_FIELDS} blockedUsers settings.profileVisibility`);
    if (!target) return res.status(404).json({ message: "User not found" });

    const card = {
      _id: target._id,
      username: target.username,
      displayName: target.displayName,
      profilePicture: target.profilePicture,
      onlineStatus: target.onlineStatus,
    };

    if (!(await canSeeFullProfile(req.user, target))) {
      return res.status(200).json({ ...card, profileVisible: false });
    }

    const [roomsJoined, materialsShared] = await Promise.all([
      ChatRoom.countDocuments({ members: target._id, isDeleted: false }),
      Material.countDocuments({ uploader: target._id, isDeleted: false }),
    ]);
    res.status(200).json({
      ...card,
      bio: target.bio,
      lastSeen: target.lastSeen,
      createdAt: target.createdAt,
      stats: { roomsJoined, materialsShared },
      profileVisible: true,
    });
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

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined && typeof updates[key] !== "string") {
        return res.status(400).json(errorBody(`${key} must be a string.`, 'MUST_BE_TEXT', { field: key }));
      }
    }
    if (updates.email !== undefined) updates.email = normalizeEmail(updates.email);
    if (updates.email === "" || updates.username === "") {
      return res.status(400).json({ message: "Email and username can't be empty." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Compared against the CURRENT values, before any assignment below -
    // these checks used to run after the loop had already copied the new
    // values onto `user`, so they never fired.
    if (updates.email && updates.email !== user.email) {
      const existing = await User.findOne({ email: updates.email });
      if (existing) return res.status(400).json({ message: "Email already in use" });
    }

    if (updates.username && updates.username !== user.username) {
      const existing = await User.findOne({ username: updates.username });
      if (existing) return res.status(400).json({ message: "Username already in use" });
    }

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        user[key] = updates[key];
      }
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
    const target = await User.findById(userId).select("isSuperAdmin");
    if (!target) return res.status(404).json({ message: "User not found" });
    // The platform must always keep at least one super admin.
    if (target.isSuperAdmin && (await User.countDocuments({ isSuperAdmin: true })) <= 1) {
      return res.status(400).json({ message: "The last super admin can't be deleted." });
    }

    const user = await User.findByIdAndDelete(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    await purgeUserReferences(req.app.get("io"), userId);
    res.status(200).json({ message: "User profile deleted successfully" });
  } catch (error) {
    return sendError(res, error, "Failed to delete user profile.");
  }
};



export const getUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const isOnline = await isUserOnline(req.app.get("io"), userId);
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
    if (role === "superadmin") query.isSuperAdmin = true;
    else if (role === "admin") query.isAdmin = true;
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
    if (!isValidObjectId(targetUserId)) return res.status(400).json({ message: "Invalid target user ID" });
    if (targetUserId === userId) return res.status(400).json({ message: "You cannot block yourself" });
    if (!(await User.exists({ _id: targetUserId }))) return res.status(404).json({ message: "User to block not found" });

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
    const user = await User.findById(userId).select("blockedUsers").populate("blockedUsers", CARD_FIELDS);
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
    // Email is matched exactly (not as a substring), so search can still find
    // someone by their full address without becoming an oracle for guessing
    // other users' emails one character at a time - and it isn't returned.
    const users = await User.find({
      $or: [
        { username: { $regex: safeQuery, $options: "i" } },
        { displayName: { $regex: safeQuery, $options: "i" } },
        { email: { $regex: `^${safeQuery}$`, $options: "i" } }
      ]
    })
      // Card fields only: bio/last seen/joined date follow each user's
      // profile visibility setting, which search used to bypass.
      .select(CARD_FIELDS)
      .limit(50);

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
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return res.status(400).json({ message: "settings must be an object." });
    }
    if (settings.darkMode !== undefined && typeof settings.darkMode !== "boolean") {
      return res.status(400).json({ message: "darkMode must be true or false." });
    }
    if (settings.language !== undefined && !SUPPORTED_LANGUAGES.includes(settings.language)) {
      return res.status(400).json({ message: "Unsupported language." });
    }
    if (settings.profileVisibility !== undefined && !PROFILE_VISIBILITY.includes(settings.profileVisibility)) {
      return res.status(400).json({ message: "Unsupported profile visibility." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (settings.darkMode !== undefined) user.settings.darkMode = settings.darkMode;
    if (settings.language !== undefined) user.settings.language = settings.language;
    if (settings.profileVisibility !== undefined) user.settings.profileVisibility = settings.profileVisibility;
    await user.save();

    res.status(200).json(user.settings);
  }catch (error) {
    return sendError(res, error, "Failed to update settings.");
  }
}



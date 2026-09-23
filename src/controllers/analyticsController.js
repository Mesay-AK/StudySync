import mongoose from "mongoose";
import ChatRoom from "../models/ChatRoom.js";
import Material from "../models/Material.js";
import RoomSession from "../models/RoomSession.js";
import Activity from "../models/Activity.js";
import DirectMessage from "../models/DirectMessage.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Report from "../models/Report.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (date) => date.toISOString().slice(0, 10);

const computeStreak = async (userId) => {
  const activityDates = await Activity.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(userId) } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } } },
  ]);
  const dateSet = new Set(activityDates.map((d) => d._id));

  let streak = 0;
  const cursor = new Date();
  while (dateSet.has(dayKey(cursor))) {
    streak += 1;
    cursor.setTime(cursor.getTime() - DAY_MS);
  }
  return streak;
};

const weeklyRoomTimeSeconds = async (userId, sessions) => {
  const now = Date.now();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    days.push(dayKey(new Date(now - i * DAY_MS)));
  }

  const byDay = Object.fromEntries(days.map((d) => [d, 0]));
  for (const session of sessions) {
    const key = dayKey(new Date(session.joinedAt));
    if (key in byDay) {
      const duration = session.leftAt
        ? session.durationSeconds
        : Math.round((now - new Date(session.joinedAt).getTime()) / 1000);
      byDay[key] += duration;
    }
  }

  return days.map((date) => ({ date, minutes: Math.round(byDay[date] / 60) }));
};

export const getMyAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    const weekAgo = new Date(Date.now() - 7 * DAY_MS);
    const twoWeeksAgo = new Date(Date.now() - 14 * DAY_MS);

    const [roomsJoined, materialsShared, sessions, streakDays, thisWeekDMs, lastWeekDMs] = await Promise.all([
      ChatRoom.countDocuments({ members: userId, isDeleted: false }),
      Material.countDocuments({ uploader: userId, isDeleted: false }),
      RoomSession.find({ user: userId, joinedAt: { $gte: weekAgo } }),
      computeStreak(userId),
      DirectMessage.countDocuments({ sender: userId, createdAt: { $gte: weekAgo } }),
      DirectMessage.countDocuments({ sender: userId, createdAt: { $gte: twoWeeksAgo, $lt: weekAgo } }),
    ]);

    const weeklyTrend = await weeklyRoomTimeSeconds(userId, sessions);
    const totalStudySecondsThisWeek = weeklyTrend.reduce((sum, d) => sum + d.minutes * 60, 0);

    const dmChangePct = lastWeekDMs === 0
      ? (thisWeekDMs > 0 ? 100 : 0)
      : Math.round(((thisWeekDMs - lastWeekDMs) / lastWeekDMs) * 100);

    res.status(200).json({
      roomsJoined,
      materialsShared,
      studyStreakDays: streakDays,
      totalStudyTimeMinutesThisWeek: Math.round(totalStudySecondsThisWeek / 60),
      weeklyTrend,
      highlights: {
        directMessagesThisWeek: thisWeekDMs,
        directMessagesChangePercent: dmChangePct,
      },
    });
  } catch (error) {
    console.error("Error computing analytics:", error);
    res.status(500).json({ message: "Failed to compute analytics" });
  }
};

const signupsPerDay = async () => {
  const weekAgo = new Date(Date.now() - 7 * DAY_MS);
  const rows = await User.aggregate([
    { $match: { createdAt: { $gte: weekAgo } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
  ]);
  const byDay = Object.fromEntries(rows.map((r) => [r._id, r.count]));

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * DAY_MS));
    days.push({ date: key, count: byDay[key] || 0 });
  }
  return days;
};

const mostActiveUsers = async () => {
  const weekAgo = new Date(Date.now() - 7 * DAY_MS);

  const [fromRooms, fromDMs] = await Promise.all([
    Message.aggregate([
      { $match: { createdAt: { $gte: weekAgo }, isDeleted: false } },
      { $group: { _id: "$sender", count: { $sum: 1 } } },
    ]),
    DirectMessage.aggregate([
      { $match: { createdAt: { $gte: weekAgo }, isDeleted: false } },
      { $group: { _id: "$sender", count: { $sum: 1 } } },
    ]),
  ]);

  const totals = new Map();
  for (const { _id, count } of [...fromRooms, ...fromDMs]) {
    const key = _id.toString();
    totals.set(key, (totals.get(key) || 0) + count);
  }

  const topIds = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const users = await User.find({ _id: { $in: topIds.map(([id]) => id) } }).select("username displayName");
  const userById = new Map(users.map((u) => [u._id.toString(), u]));

  return topIds.map(([id, count]) => ({
    user: userById.get(id),
    messageCount: count,
  })).filter((row) => row.user);
};

export const getAdminOverview = async (req, res) => {
  try {
    const [totalUsers, totalRooms, totalMessages, totalMaterials, pendingReports, bannedUsers] = await Promise.all([
      User.countDocuments(),
      ChatRoom.countDocuments({ isDeleted: false }),
      Message.countDocuments({ isDeleted: false }),
      Material.countDocuments({ isDeleted: false }),
      Report.countDocuments({ status: "pending" }),
      User.countDocuments({ isBanned: true }),
    ]);

    const topRooms = await ChatRoom.aggregate([
      { $match: { isDeleted: false } },
      { $project: { name: true, subject: true, memberCount: { $size: "$members" } } },
      { $sort: { memberCount: -1 } },
      { $limit: 5 },
    ]);

    const [signups, activeUsers, recentActivity] = await Promise.all([
      signupsPerDay(),
      mostActiveUsers(),
      Activity.find().sort({ createdAt: -1 }).limit(10).populate("user", "username displayName"),
    ]);

    res.status(200).json({
      totalUsers,
      totalRooms,
      totalMessages,
      totalMaterials,
      pendingReports,
      bannedUsers,
      topRooms,
      signupsPerDay: signups,
      mostActiveUsers: activeUsers,
      recentActivity,
    });
  } catch (error) {
    console.error("Error computing admin overview:", error);
    res.status(500).json({ message: "Failed to compute overview" });
  }
};

import Notification from "../models/Notification.js";
import { sendError } from "../utils/errorResponse.js";
import { clampPagination } from "../utils/pagination.js";

export const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    // Every room message creates a notification per member, so this grew
    // without bound and was returned in full on every dropdown open.
    const { skip, limit } = clampPagination(req.query.page, req.query.limit ?? 50);
    // updatedAt: a coalesced room notification moves to the top when another
    // message lands in it.
    const notifications = await Notification.find({ recipient: userId })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);
    res.status(200).json(notifications);
  } catch (error) {
    return sendError(res, error, "Failed to fetch notifications.");
  }
};

// One request instead of one per notification for "Mark all as read".
export const markAllAsRead = async (req, res) => {
  try {
    const result = await Notification.updateMany({ recipient: req.user.id, isRead: false }, { $set: { isRead: true } });
    res.status(200).json({ updatedCount: result.modifiedCount });
  } catch (error) {
    return sendError(res, error, "Failed to update notifications.");
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: req.user.id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.status(200).json(notification);
  } catch (error) {
    return sendError(res, error, "Failed to update notification.");
  }
};

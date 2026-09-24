import Notification from "../models/Notification.js";
import { sendError } from "../utils/errorResponse.js";

export const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const notifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 });
    res.status(200).json(notifications);
  } catch (error) {
    return sendError(res, error, "Failed to fetch notifications.");
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
      return res.status(404).json({ error: "Notification not found" });
    }

    res.status(200).json(notification);
  } catch (error) {
    return sendError(res, error, "Failed to update notification.");
  }
};

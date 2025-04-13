import Notification from "../models/Notification.js";

export const getNotifications = async (req, res) => {
  const userId = req.user.id;
  const notifications = await Notification.find({ recipient: userId }).sort({ createdAt: -1 });
  res.status(200).json(notifications);
};

export const markAsRead = async (req, res) => {
  const { id } = req.params;
  await Notification.findByIdAndUpdate(id, { read: true });
  res.status(200).json({ message: "Notification marked as read" });
};

import Announcement from "../models/Announcement.js";
import { sendError } from "../utils/errorResponse.js";

export const getAnnouncements = async (req, res) => {
  try {
    const filter = req.user.isAdmin ? {} : { isActive: true };
    const announcements = await Announcement.find(filter).sort({ createdAt: -1 });
    res.status(200).json(announcements);
  } catch (error) {
    return sendError(res, error, "Failed to fetch announcements.");
  }
};

export const createAnnouncement = async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ message: "Title and content are required" });

    const announcement = await Announcement.create({ title, content, createdBy: req.user.id });
    res.status(201).json(announcement);
  } catch (error) {
    return sendError(res, error, "Failed to create announcement.");
  }
};

export const toggleAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ message: "Announcement not found" });

    announcement.isActive = !announcement.isActive;
    await announcement.save();
    res.status(200).json(announcement);
  } catch (error) {
    return sendError(res, error, "Failed to update announcement.");
  }
};

export const deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) return res.status(404).json({ message: "Announcement not found" });
    res.status(200).json({ message: "Announcement deleted" });
  } catch (error) {
    return sendError(res, error, "Failed to delete announcement.");
  }
};

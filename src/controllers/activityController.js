import Activity from "../models/Activity.js";
import { sendError } from "../utils/errorResponse.js";
import { clampPagination } from "../utils/pagination.js";

export const getMyActivity = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { limit: safeLimit, skip } = clampPagination(page, limit);

    const activities = await Activity.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit);

    res.status(200).json(activities);
  } catch (error) {
    return sendError(res, error, "Failed to fetch activity.");
  }
};

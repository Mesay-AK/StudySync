import Activity from "../models/Activity.js";

export const getMyActivity = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const activities = await Activity.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.status(200).json(activities);
  } catch (error) {
    console.error("Error fetching activity:", error);
    res.status(500).json({ message: "Failed to fetch activity" });
  }
};

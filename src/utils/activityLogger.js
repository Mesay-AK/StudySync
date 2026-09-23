import Activity from "../models/Activity.js";

export const logActivity = async ({ user, type, description, metadata = {} }) => {
  try {
    await Activity.create({ user, type, description, metadata });
  } catch (error) {
    console.error("Failed to log activity:", error.message);
  }
};

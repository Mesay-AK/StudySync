import Activity from "../models/Activity.js";
import logger from "./logger.js";

export const logActivity = async ({ user, type, description, metadata = {} }) => {
  try {
    await Activity.create({ user, type, description, metadata });
  } catch (error) {
    logger.error({ err: error, user, type }, "Failed to log activity");
  }
};

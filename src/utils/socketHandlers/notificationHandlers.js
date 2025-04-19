import Notification from "../models/Notification.js";

export const createAndSendNotification = async ({ 
  io, 
  type, 
  recipientId, 
  senderId = null, 
  content = "", 
  metadata = {} 
}) => {
  try {
    const notification = new Notification({
      type,
      recipient: recipientId,
      sender: senderId,
      content,
      metadata,
    });

    // Save notification to database
    await notification.save();

    // Emit to the recipient through Socket.IO
    io.to(recipientId).emit("newNotification", notification);
  } catch (error) {
    console.error("Error creating and sending notification:", error.message);
    // Optional: Emit error message to the client (if needed)
    io.to(recipientId).emit("error", { message: "Failed to send notification." });
  }
};

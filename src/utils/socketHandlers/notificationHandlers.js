import Notification from "../models/Notification.js";

export const createAndSendNotification = async ({ 
  io, 
  type, 
  recipientId, 
  senderId = null, 
  content = "", 
  metadata = {} 
}) => {
  const notification = new Notification({
    type,
    recipient: recipientId,
    sender: senderId,
    content,
    metadata,
  });

  await notification.save();

  io.to(recipientId).emit("newNotification", notification);
};

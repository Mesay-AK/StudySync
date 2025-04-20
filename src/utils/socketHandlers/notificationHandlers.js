import User from "../../models/User.js";
import Notification from "../../models/Notfication.js";


export const createAndSendNotification = async ({
  io,
  type,
  recipientId,
  senderId = null,
  content = "",
  metadata = {},
}) => {
  try {
    if (!recipientId || !senderId) {
      console.error("Sender or recipient ID missing");
      return;
    }

    // Fetch the users involved in the notification (sender and recipient)
    const senderUser = await User.findById(senderId);
    const recipientUser = await User.findById(recipientId);

    if (!senderUser || !recipientUser) {
      console.error("Sender or recipient not found");
      return;
    }

    // Ensure that the sender is not blocked by the recipient
    if (recipientUser.blockedUsers.includes(senderId)) {
      console.log(`Notification not sent: ${senderId} is blocked by ${recipientId}`);
      return; // Recipient has blocked the sender, don't send the notification
    }

    // Ensure that the sender has not blocked the recipient
    if (senderUser.blockedUsers.includes(recipientId)) {
      console.log(`Notification not sent: ${recipientId} is blocked by ${senderId}`);
      return; // Sender has blocked the recipient, don't send the notification
    }

    // Create and save the notification
    const notification = new Notification({
      type,
      recipient: recipientId,
      sender: senderId,
      content,
      metadata,
    });

    await notification.save();

    // Emit the notification to the recipient
    io.to(recipientId).emit("newNotification", notification);
  } catch (error) {
    console.error("Error creating and sending notification:", error.message);
    // Optional: Emit error message to the recipient (if needed)
    io.to(recipientId).emit("error", { message: "Failed to send notification." });
  }
};

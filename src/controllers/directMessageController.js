// import DirectMessage from "../models/DirectMessage.js";

// const sendMessage = async (req, res) => {
//     try {
//         const { sender, receiver, content } = req.body;
//         const newMessage = new DirectMessage({ sender, receiver, content });

//         await newMessage.save();
//         await User.findByIdAndUpdate(receiver, { $inc: { unreadMessages: 1 } });
        
//         req.io.to(receiver).emit("newDirectMessageNotification", {
//             sender,
//             message: content,
//         });

//         res.status(201).json(newMessage);
//     } catch (error) {
//         res.status(500).json({ message: "Error sending message" });
//     }
// };

// const getMessages = async (req, res) => {
//     try {
//         const { sender, receiver } = req.params;
//         const messages = await DirectMessage.find({
//             $or: [{ sender, receiver }, { sender: receiver, receiver: sender }]
//         }).sort({ createdAt: 1 });

//         res.status(200).json(messages);
//     } catch (error) {
//         console.error("Error fetching messages:", error);
//         res.status(500).json({ message: "Internal server error" });
//     }
// };

// const deleteMessage = async (req, res) => {
//     try {
//         const { messageId } = req.params;
//         await DirectMessage.findByIdAndDelete(messageId);
//         res.status(200).json({ message: "Message deleted successfully" });
//     } catch (error) {
//         console.error("Error deleting message:", error);
//         res.status(500).json({ message: "Internal server error" });
//     }
// };

// const markAsSeen = async (req, res) => { 
//     try {
//         const { messageId } = req.params;
//         const message = await DirectMessage.findById(messageId);
//         if (!message) {
//             return res.status(404).json({ message: "Message not found" });
//         }
//         message.seen = true;
//         await message.save();
//         res.status(200).json({ message: "Message marked as seen" });
//     } catch (error) {
//         console.error("Error marking message as seen:", error);
//         res.status(500).json({ message: "Internal server error" });
//     }
// };

// const markMessagesAsRead = async (req, res) => {
//     try {
//         const { userId } = req.params;
//         await User.findByIdAndUpdate(userId, { unreadMessages: 0 });
//         res.status(200).json({ message: "Messages marked as read" });
//     } catch (error) {
//         res.status(500).json({ message: "Error updating message status" });
//     }
// };

// // Search Direct Messages
// const searchMessages = async (req, res) => {
//     try {
//         const { sender, receiver, searchTerm } = req.query;
//         const messages = await DirectMessage.find({
//             $or: [{ sender, receiver }, { sender: receiver, receiver: sender }],
//             content: { $regex: searchTerm, $options: "i" }
//         }).sort({ createdAt: 1 });

//         res.status(200).json(messages);
//     } catch (error) {
//         console.error("Error searching messages:", error);
//         res.status(500).json({ message: "Internal server error" });
//     }
// };


// export { sendMessage, getMessages, deleteMessage, markAsSeen, searchMessages, markMessagesAsRead };

import { usersOnline } from "../socketHandlers/userHandler.js"; 
import User from "../models/User.js"; // Assuming you have 



const getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select("-password"); // Exclude password from the response

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user); // Send user profile
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


const updateUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    const { displayName, bio, profilePicture } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update user data
    if (displayName) user.displayName = displayName;
    if (bio) user.bio = bio;
    if (profilePicture) user.profilePicture = profilePicture;

    await user.save();

    res.status(200).json(user); // Return updated profile
  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



const getUserStatus = (req, res) => {
  try {
    const { userId } = req.params;
    const isOnline = [...usersOnline.values()].includes(userId); // Check if user is connected via socket

    res.status(200).json({ userId, online: isOnline });
  } catch (error) {
    console.error("Error fetching user status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body; // Expected status could be 'online', 'offline', 'away', etc.

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.status = status || "offline"; // Default to 'offline' if no status is provided
    await user.save();

    res.status(200).json({ userId, status: user.status });
  } catch (error) {
    console.error("Error updating user status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



export { getUserProfile, updateUserProfile, getUserStatus, updateUserStatus };

import bcrypt from "bcryptjs";
import User from "../models/User.js";
import {hashedPassword, comparePassword, hashPassword} from "../utils/passwordHelpers/password-helper.js";
import {generateAccessToken, generateRefreshToken, verifyAccessToken, validateRefreshToken, deleteRefreshToken} from "../utils/tokenHelpers/token-helper.js";

const registerUser = async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const hashedPassword = hashPassword(password);
    if (!hashedPassword) {
      return res.status(500).json({ message: "Failed to hash password" });
    }
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      displayName: displayName || username, 
    });

    await newUser.save();
    res.status(201).json({ message: "User registered successfully", userId: newUser._id });

  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};



const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = generateAccessToken({ userId: user._id });


    res.status(200).json({ token, userId: user._id, displayName: user.displayName });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


const refreshToken = async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(401).json({ message: "Refresh token not provided" });
  }

  try {
    const userId = validateRefreshToken(token);
    if (!userId) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    const newAccessToken = generateAccessToken({ userId });
    res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    console.error("Error refreshing token:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const logoutUser = async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(401).json({ message: "Refresh token not provided" });
  }

  try {
    const userId = validateRefreshToken(token);
    if (!userId) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    await deleteRefreshToken(token);
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Error logging out:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getUserProfile = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deleteProfile = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User profile deleted successfully" });
  } catch (error) {
    console.error("Error deleting user profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
} ;


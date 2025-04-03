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

    // Hash password
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


export { registerUser };

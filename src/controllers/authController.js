import User from "../models/User.js";
import {comparePassword, hashPassword} from "../utils/passwordHelpers/password-helper.js";
import {generateAccessToken, generateRefreshToken, validateRefreshToken, deleteRefreshToken} from "../utils/Tokens/tokenHelper.js";


const registerUser = async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const hashedPassword = await hashPassword(password);
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



const logInUser = async (req, res) => {
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

    const token = generateAccessToken({ userId: user._id, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user._id, email: user.email });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      // secure: process.env.NODE_ENV === "production",
      secure: true,
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, 
    });

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
    const validated = validateRefreshToken(token);
    if (!validated) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    const newAccessToken = generateAccessToken({ validated });
    res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    console.error("Error refreshing token:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const logOutUser = async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(401).json({ message: "Refresh token not provided" });
  }

  try {
    const userId = validateRefreshToken(token);
    if (!userId) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    await deleteRefreshToken(decoded.sessionId);

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Error logging out:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


export { registerUser, logInUser, refreshToken, logOutUser };
import User from '../models/User.js';
import { comparePassword, hashPassword } from '../utils/passwordHelpers/password-helper.js';
import {
  generateAccessToken,
  generateRefreshToken,
  validateRefreshToken,
  deleteRefreshToken,
  generatePasswordResetToken,
  generateVerificationToken
} from '../utils/Tokens/jwtTokens.js';
import sendEmail from '../utils/emailService.js';  // Assuming sendEmail utility is available

// Register User with Email Verification
export const registerUser = async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    // Check if the email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    // Password Strength Validation
    const passwordStrength = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+])[A-Za-z\d!@#$%^&*()_+]{8,}$/;
    if (!passwordStrength.test(password)) {
      return res.status(400).json({ message: 'Password is too weak' });
    }

    const hashedPassword = await hashPassword(password);
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      displayName: displayName || username
    });

    await newUser.save();

    // Generate email verification token
    const verificationToken = generateVerificationToken();
    newUser.emailVerificationToken = verificationToken;
    await newUser.save();

    const verificationLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;
    await sendEmail({
      to: email,
      subject: 'Email Verification',
      html: `<p>Click <a href="${verificationLink}">here</a> to verify your email address.</p>`
    });

    return res.status(201).json({ message: 'User registered successfully, please verify your email.' });
  } catch (error) {
    console.error('Error registering user:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Login User
export const logInUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await comparePassword(password, user.password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const accessToken = generateAccessToken({ userId: user._id, email: user.email });
    const refreshToken = await generateRefreshToken({ userId: user._id, email: user.email });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    return res.status(200).json({ token: accessToken, userId: user._id, displayName: user.displayName });
  } catch (error) {
    console.error('Error logging in:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Refresh Access Token
export const refreshToken = async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(401).json({ message: 'Refresh token not provided' });

  try {
    const decoded = await validateRefreshToken(token);
    const newAccessToken = generateAccessToken(decoded);
    return res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    console.error('Error refreshing token:', error);
    return res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
};

// Log Out User
export const logOutUser = async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(401).json({ message: 'Refresh token not provided' });

  try {
    const decoded = await validateRefreshToken(token);
    await deleteRefreshToken(decoded.sessionId);
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Error logging out:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Password Reset Request
export const requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const resetToken = generatePasswordResetToken();
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour expiration
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    await sendEmail({
      to: email,
      subject: "Password Reset Request",
      html: `<p>Click <a href="${resetLink}">here</a> to reset your password.</p>`
    });

    res.status(200).json({ message: "Password reset email sent" });
  } catch (error) {
    console.error("Error during password reset request:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Password Reset Handler
export const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const hashedPassword = await hashPassword(newPassword);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Error during password reset:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

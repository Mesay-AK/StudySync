import User from '../models/User.js';
import { comparePassword, hashPassword, isStrongPassword } from '../utils/passwordHelpers/password-helper.js';
import {generateRefreshToken,
        generateAccessToken,
        validateRefreshToken,
        deleteRefreshToken,
        generatePasswordResetToken,
} from '../utils/Tokens/jwtTokens.js';
import {sendEmail} from "../utils/emailService.js";
import { setAuthCookies, clearAuthCookies } from '../utils/Tokens/authCookies.js';
import { sendError } from '../utils/errorResponse.js';

export const registerUser = async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      const field = existingUser.email === email ? 'Email' : 'Username';
      return res.status(400).json({ message: `${field} already in use` });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.' });
    }

    const hashedPassword = await hashPassword(password);
    if (!hashedPassword) {
      console.log('Error hashing password');
      return res.status(500).json({ message: 'Error hashing password' });   
    }
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      displayName: displayName || username
    });

    await newUser.save();

    return res.status(201).json({ message: 'User registered successfully.' });
  } catch (error) {
    return sendError(res, error, "Failed to register. Please try again.");
  }
};


export const logInUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');

    if (!user || !user.password || !(await comparePassword(password, user.password))) {
      console.log('Invalid email or password:', email);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.isBanned) {
      return res.status(403).json({ message: 'Access denied. You are banned.' });
    }

    const accessToken = generateAccessToken({ userId: user._id, email: user.email});
    const refreshToken = await generateRefreshToken({ userId: user._id, email: user.email });

    setAuthCookies(res, accessToken, refreshToken);

    return res.status(200).json({ token: accessToken, userId: user._id, displayName: user.displayName });
  } catch (error) {
    return sendError(res, error, "Failed to log in. Please try again.");
  }
};



export const refreshToken = async (req, res) => {
  const oldRefreshToken = req.cookies.refreshToken;
  if (!oldRefreshToken) {
    return res.status(401).json({ message: 'Refresh token not provided' });
  }

  try {
    const decoded = await validateRefreshToken(oldRefreshToken);

    // Rotate: invalidate the used refresh token and issue a new pair.
    await deleteRefreshToken(decoded.sessionId);

    const payload = { userId: decoded.userId, email: decoded.email };
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = await generateRefreshToken(payload);

    setAuthCookies(res, newAccessToken, newRefreshToken);

    return res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    console.error('Error refreshing token:', error.message);
    return res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
};

export const logOutUser = async (req, res) => {
  const token = req.cookies.refreshToken;

  try {
    if (token) {
      const decoded = await validateRefreshToken(token).catch(() => null);
      if (decoded) await deleteRefreshToken(decoded.sessionId);
    }
  } catch (error) {
    console.error('Error logging out:', error);
  }

  clearAuthCookies(res);
  return res.status(200).json({ message: 'Logged out successfully' });
};

export const requestPasswordReset = async (req, res) => {
  const { email } = req.body;
  const genericResponse = { message: "If that email is registered, a reset link has been sent." };

  try {
    const user = await User.findOne({ email });
    // Don't reveal whether the email is registered.
    if (!user) return res.status(200).json(genericResponse);

    const resetToken = generatePasswordResetToken();
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    await sendEmail({
      to: email,
      subject: "Password Reset Request",
      html: `<p>Click <a href="${resetLink}">here</a> to reset your password. This link expires in 1 hour.</p>`
    });

    res.status(200).json(genericResponse);
  } catch (error) {
    return sendError(res, error, "Failed to process your request. Please try again.");
  }
};

export const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.' });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.password = await hashPassword(newPassword);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    return sendError(res, error, "Failed to reset password. Please try again.");
  }
};

export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.' });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user.password || !(await comparePassword(currentPassword, user.password))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    return sendError(res, error, "Failed to change password. Please try again.");
  }
};

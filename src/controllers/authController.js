import User from '../models/User.js';
import { comparePassword, hashPassword, isStrongPassword } from '../utils/passwordHelpers/password-helper.js';
import {generateRefreshToken,
        generateAccessToken,
        validateRefreshToken,
        deleteRefreshToken,
        generatePasswordResetToken,
        hashResetToken,
        tokenPayloadFor,
        isSessionCurrent,
} from '../utils/Tokens/jwtTokens.js';
import { setAuthCookies, clearAuthCookies } from '../utils/Tokens/authCookies.js';
import { sendError } from '../utils/errorResponse.js';
import { emailQueue } from '../queues/emailQueue.js';
import { validateNewAccount, normalizeEmail } from '../utils/validation.js';

const WEAK_PASSWORD_MESSAGE = 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.';

const issueSession = async (res, user) => {
  const payload = tokenPayloadFor(user);
  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(payload);
  setAuthCookies(res, accessToken, refreshToken);
  return accessToken;
};

export const registerUser = async (req, res) => {
  try {
    const { username, password, displayName } = req.body;

    const invalid = validateNewAccount({ username, email: req.body.email, password });
    if (invalid) return res.status(400).json({ message: invalid });
    const email = normalizeEmail(req.body.email);

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      const field = existingUser.email === email ? 'Email' : 'Username';
      return res.status(400).json({ message: `${field} already in use` });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({ message: WEAK_PASSWORD_MESSAGE });
    }

    const hashedPassword = await hashPassword(password);
    if (!hashedPassword) {
      req.log.error('Error hashing password');
      return res.status(500).json({ message: 'Error hashing password' });
    }
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      displayName: typeof displayName === 'string' && displayName ? displayName : username
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
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: normalizeEmail(email) }).select('+password');

    if (!user || !user.password || !(await comparePassword(password, user.password))) {
      req.log.info({ email }, 'Failed login attempt: invalid email or password');
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.isBanned) {
      return res.status(403).json({ message: 'Access denied. You are banned.' });
    }

    const accessToken = await issueSession(res, user);

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

    // Rotate: invalidate the used refresh token and issue a new pair, kept
    // in the same family so a later replay of this (now-stale) token is
    // recognized as reuse instead of just "invalid".
    await deleteRefreshToken(decoded.sessionId);

    // A refresh token must not outlive the account's standing: deleted,
    // banned, or credentials changed since it was issued.
    const user = await User.findById(decoded.userId);
    if (!user || user.isBanned || !isSessionCurrent(decoded, user)) {
      clearAuthCookies(res);
      return res.status(403).json({ message: 'Invalid or expired refresh token' });
    }

    const payload = tokenPayloadFor(user);
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = await generateRefreshToken(payload, decoded.familyId);

    setAuthCookies(res, newAccessToken, newRefreshToken);

    return res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    req.log.error({ err: error }, 'Error refreshing token');
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
    req.log.error({ err: error }, 'Error logging out');
  }

  clearAuthCookies(res);
  return res.status(200).json({ message: 'Logged out successfully' });
};

export const requestPasswordReset = async (req, res) => {
  const { email } = req.body;
  const genericResponse = { message: "If that email is registered, a reset link has been sent." };

  try {
    if (typeof email !== 'string' || !email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const user = await User.findOne({ email: normalizeEmail(email) });
    // Don't reveal whether the email is registered.
    if (!user) return res.status(200).json(genericResponse);

    const resetToken = generatePasswordResetToken();
    await User.updateOne(
      { _id: user._id },
      { $set: { resetPasswordToken: hashResetToken(resetToken), resetPasswordExpires: new Date(Date.now() + 3600000) } }
    );

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    await emailQueue.add("password-reset", {
      to: user.email,
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
    // Must be a plain string: a JSON object like {"$ne": null} used to be
    // passed straight into the query and match ANY user's pending token.
    if (typeof token !== 'string' || !token) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ message: WEAK_PASSWORD_MESSAGE });
    }

    const hashedPassword = await hashPassword(newPassword);

    // One atomic find-and-consume, so the same token can't be redeemed twice
    // by concurrent requests. Bumping tokenVersion signs out every existing
    // session - the point of a reset is usually that someone else may have
    // the old password.
    const user = await User.findOneAndUpdate(
      { resetPasswordToken: hashResetToken(token), resetPasswordExpires: { $gt: new Date() } },
      {
        $set: { password: hashedPassword, resetPasswordToken: null, resetPasswordExpires: null },
        $inc: { tokenVersion: 1 },
      }
    );

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    return sendError(res, error, "Failed to reset password. Please try again.");
  }
};

// Resolves "who am I" from the auth cookie alone, with no id required from the
// caller - needed for the OAuth redirect flow, where the frontend never
// receives a userId (only cookies get set server-side on that path).
export const getCurrentUser = async (req, res) => {
  res.status(200).json(req.user);
};

export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ message: WEAK_PASSWORD_MESSAGE });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user.password || typeof currentPassword !== 'string' || !(await comparePassword(currentPassword, user.password))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = await hashPassword(newPassword);
    // Signs out every other session; the caller gets a fresh one below so
    // changing your password doesn't log you out of the tab you did it in.
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    const token = await issueSession(res, user);

    res.status(200).json({ message: 'Password updated successfully', token });
  } catch (error) {
    return sendError(res, error, "Failed to change password. Please try again.");
  }
};

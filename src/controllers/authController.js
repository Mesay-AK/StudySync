
import User from '../models/User.js';
import {
  comparePassword,
  hashPassword
} from '../utils/passwordHelpers/password-helper.js';
import {
  generateAccessToken,
  generateRefreshToken,
  validateRefreshToken,
  deleteRefreshToken
} from '../utils/Tokens/tokenHelper.js';

export const registerUser = async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const hashedPassword = await hashPassword(password);
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      displayName: displayName || username
    });

    await newUser.save();
    return res.status(201).json({ message: 'User registered successfully', userId: newUser._id });
  } catch (error) {
    console.error('Error registering user:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

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

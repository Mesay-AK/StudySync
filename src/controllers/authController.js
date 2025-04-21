import User from '../models/User.js';
import { comparePassword, hashPassword } from '../utils/passwordHelpers/password-helper.js';
import {generateRefreshToken,
        generateAccessToken,
        validateRefreshToken,
        deleteRefreshToken,
        generatePasswordResetToken,
} from '../utils/Tokens/jwtTokens.js';
import {sendEmail} from "../utils/emailService.js";



export const registerUser = async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log('Email already in use:', email);
      return res.status(400).json({ message: 'Email already in use' });
    }

  
    const passwordStrength = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+])[A-Za-z\d!@#$%^&*()_+]{8,}$/;
    if (!passwordStrength.test(password)) {
      console.log('Password is too weak:', password);
      return res.status(400).json({ message: 'Password is too weak' });
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
    console.error('Error registering user:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};


export const logInUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await comparePassword(password, user.password))) {
      console.log('Invalid email or password:', email);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const accessToken = generateAccessToken({ userId: user._id, email: user.email});
    const refreshToken = await generateRefreshToken({ userId: user._id, email: user.email });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 
    });

    return res.status(200).json({ token: accessToken, userId: user._id, displayName: user.displayName });
  } catch (error) {
    console.error('Error logging in:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};



export const refreshToken = async (req, res) => {
 const refreshToken = req.cookies.refreshToken
  if (!refreshToken) {
    console.log('Refresh token not provided');
    return res.status(401).json({ message: 'Refresh token not provided' });}

  try {
    const decoded = await validateRefreshToken(refreshToken);
    if (!decoded) {
      console.log('Invalid refresh token:', refreshToken);
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    const user = { userId: decoded._id, email: decoded.email }

    const newAccessToken = generateAccessToken(user);
    if (!newAccessToken) {
      console.log('Error generating new access token');
      return res.status(500).json({ message: 'Error generating new access token' });
    }



    return res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    console.error('Error refreshing token:', error);
    return res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
};

// Log Out User
export const logOutUser = async (req, res) => {
  const refreshToken = req.cookies.refreshToken
  if (!refreshToken) {
    console.log('Refresh token not provided');
    return res.status(401).json({ message: 'Refresh token not provided' });}

  try {
    const decoded = await validateRefreshToken(refreshToken);
    await deleteRefreshToken(decoded.sessionId);
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Error logging out:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found:', email);
      return res.status(404).json({ message: "User not found" });
    }

    const resetToken = generatePasswordResetToken();
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000;
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


export const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      console.log("Invalid or expired token:", token);
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const hashedPassword = await hashPassword(newPassword);
    if (!hashedPassword) {
      console.log("Error hashing new password");
      return res.status(500).json({ message: "Error hashing new password" });
    }
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

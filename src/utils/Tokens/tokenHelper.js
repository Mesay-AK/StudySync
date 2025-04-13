// utils/Tokens/tokenHelper.js
import jwt from 'jsonwebtoken';
import redisClient from '../../config/redisClient.js';
import { v4 as uuidv4 } from 'uuid';

export const generateAccessToken = (payload) => {
  const sessionId = uuidv4();
  const accessToken = jwt.sign(
    { ...payload, sessionId },
    process.env.JWT_SECRET,
    { expiresIn: '1h', algorithm: 'HS256' }
  );
  return accessToken;
};

export const generateRefreshToken = async (payload) => {
  const sessionId = uuidv4();
  const refreshToken = jwt.sign(
    { ...payload, sessionId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d', algorithm: 'HS256' }
  );

  try {
    await redisClient.set(`refreshToken:${sessionId}`, refreshToken, 'EX', 7 * 24 * 60 * 60);
  } catch (error) {
    console.error('Error storing refresh token in Redis:', error);
  }

  return refreshToken;
};

export const verifyAccessToken = async (token) => {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    return payload;
  } catch (error) {
    throw new Error(`Invalid or expired token: ${error.message}`);
  }
};

export const validateRefreshToken = async (refreshToken) => {
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
    const storedToken = await redisClient.get(`refreshToken:${decoded.sessionId}`);

    if (!storedToken || storedToken !== refreshToken) {
      throw new Error('Invalid or expired refresh token');
    }

    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

export const deleteRefreshToken = async (sessionId) => {
  try {
    await redisClient.del(`refreshToken:${sessionId}`);
  } catch (error) {
    console.error('Failed to delete refresh token from Redis:', error);
    throw new Error('Failed to delete refresh token from Redis');
  }
};

export const generatePasswordResetToken = () => {
  return crypto.randomBytes(32).toString('hex'); // Generates a random token
}

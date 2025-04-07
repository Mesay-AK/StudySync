
import jwt from 'jsonwebtoken';
import redisClient from '../cache/redisClient.js';
import { v4 as uuidv4 } from 'uuid';



const generateAccessToken = (payload) => {
    payload.iat = Math.floor(Date.now() / 1000);
    payload.sessionId = uuidv4();


    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m', algorithm: 'HS256' });

    return token
}

const generateRefreshToken = async(payload) => {
    payload.iat = Math.floor(Date.now() / 1000);
    payload.sessionId = uuidv4();
    const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d', algorithm: 'HS256' });


    try {
        await redisClient.set(`refreshToken:${payload.sessionId}`, refreshToken, 'EX', 7 * 24 * 60 * 60);
    } catch (error) {
        console.error('Error storing refresh token in Redis:', error);
    }

    return refreshToken;
}

const verifyAccessToken = async(token) => {
    try {

        const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

        return payload;
    } catch (error) {
        throw new Error(`Invalid or expired token: ${error.message}`);
    }
}

const validateRefreshToken = async(refreshToken) => {
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
}

const deleteRefreshToken =  async(sessionId) =>   {
    try {
        await redisClient.del(`refreshToken:${sessionId}`);
    } catch (error) {
        console.log(error);
        throw new Error('Failed to delete refresh token from Redis');
    }
}


export { generateAccessToken, generateRefreshToken, verifyAccessToken, validateRefreshToken, deleteRefreshToken };
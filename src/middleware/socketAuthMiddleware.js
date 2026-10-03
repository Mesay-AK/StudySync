import cookie from 'cookie';
import { verifyAccessToken, isSessionCurrent } from '../utils/Tokens/jwtTokens.js';
import User from '../models/User.js';

// Authenticates the socket handshake using the same accessToken cookie (or a
// bearer token passed via `auth.token`, for non-browser clients) that the
// REST API trusts. Every downstream handler relies on `socket.userId` being
// the verified identity - never a value taken from an event payload.
export const socketAuthMiddleware = async (socket, next) => {
  try {
    const rawCookie = socket.handshake.headers.cookie;
    const cookieToken = rawCookie ? cookie.parse(rawCookie).accessToken : null;
    const token = cookieToken || socket.handshake.auth?.token;

    if (!token) return next(new Error('Authentication required'));

    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.userId);

    if (!user) return next(new Error('User not found'));
    if (user.isBanned) return next(new Error('Account banned'));
    if (!isSessionCurrent(decoded, user)) return next(new Error('Session revoked'));

    socket.userId = user._id.toString();
    socket.user = user;
    // When the handshake's access token expires (see config/socket.js).
    socket.tokenExpiresAt = decoded.exp * 1000;
    next();
  } catch (err) {
    next(new Error('Authentication failed'));
  }
};

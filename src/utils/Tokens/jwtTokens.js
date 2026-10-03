// utils/Tokens/tokenHelper.js
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import redisClient from '../../config/redisClient.js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../logger.js';

const ACCESS_TOKEN_EXPIRY = Number(process.env.JWT_ACCESS_TOKEN_EXPIRY) || 900;
const REFRESH_TOKEN_EXPIRY = Number(process.env.JWT_REFRESH_TOKEN_EXPIRY) || 604800;

// The claims every access/refresh token carries. tokenVersion ties the token
// to the account's current credentials - see isSessionCurrent below.
export const tokenPayloadFor = (user) => ({
  userId: user._id,
  email: user.email,
  tokenVersion: user.tokenVersion ?? 0,
});

// False once the account's tokenVersion has been bumped (password reset or
// change) since this token was issued. Tokens minted before tokenVersion
// existed carry none and count as version 0, so deploying this doesn't log
// everyone out.
export const isSessionCurrent = (decoded, user) => (decoded.tokenVersion ?? 0) === (user.tokenVersion ?? 0);

export const generateAccessToken = (payload) => {
  const sessionId = uuidv4();
  const accessToken = jwt.sign(
    { ...payload, sessionId },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY, algorithm: 'HS256' }
  );
  return accessToken;
};

// `familyId` identifies a chain of rotations from a single login. Omitting it
// (login, OAuth) starts a new family; passing the previous token's familyId
// (refresh) keeps the chain going so reuse of an already-rotated token can be
// detected below.
export const generateRefreshToken = async (payload, familyId = uuidv4()) => {
  const sessionId = uuidv4();
  const refreshToken = jwt.sign(
    { ...payload, sessionId, familyId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY, algorithm: 'HS256' }
  );

  // Deliberately not caught here: if this write fails, the refresh token is
  // unusable (validateRefreshToken requires the Redis-stored copy to match),
  // so the caller must fail loudly rather than issue a login that silently
  // can't refresh later.
  await redisClient.set(`refreshToken:${sessionId}`, refreshToken, 'EX', REFRESH_TOKEN_EXPIRY);
  await redisClient.set(`refreshFamily:${familyId}`, sessionId, 'EX', REFRESH_TOKEN_EXPIRY);

  return refreshToken;
};

// Synchronous by design (jwt.verify is sync) - callers must NOT await-forget this.
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    throw new Error(`Invalid or expired token: ${error.message}`);
  }
};

// Signature/expiry only - no Redis checks.
export const verifyRefreshSignature = (refreshToken) => {
  try {
    return jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

export const validateRefreshToken = async (refreshToken) => {
  const decoded = verifyRefreshSignature(refreshToken);

  const { sessionId, familyId } = decoded;

  // If the family's currently-valid session doesn't match this token's
  // sessionId, this token was already rotated out and is being replayed -
  // e.g. a stolen token used after the legitimate user already refreshed.
  // Revoke the whole family so both the attacker's and the legitimate
  // session stop working, forcing a fresh login rather than letting the
  // attacker's session continue silently.
  const currentSessionId = await redisClient.get(`refreshFamily:${familyId}`);
  if (currentSessionId && currentSessionId !== sessionId) {
    await redisClient.del(`refreshFamily:${familyId}`, `refreshToken:${currentSessionId}`);
    throw new Error('Refresh token reuse detected - session revoked');
  }

  const storedToken = await redisClient.get(`refreshToken:${sessionId}`);
  if (!storedToken || storedToken !== refreshToken) {
    throw new Error('Invalid or expired refresh token');
  }

  return decoded;
};

export const deleteRefreshToken = async (sessionId) => {
  try {
    await redisClient.del(`refreshToken:${sessionId}`);
  } catch (error) {
    logger.error({ err: error, sessionId }, 'Failed to delete refresh token from Redis');
    throw new Error('Failed to delete refresh token from Redis');
  }
};

export const generatePasswordResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Only the hash is stored, so a database leak doesn't hand out working reset links.
export const hashResetToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

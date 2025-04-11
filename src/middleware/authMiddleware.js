
import User from '../models/User.js';
import { verifyAccessToken } from '../utils/Tokens/tokenHelper.js';

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Access token missing or invalid' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = await verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token verification error:', error.message);
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

export const validateUser = async (req, res, next) => {
  const userId = req.params.userId || req.body.userId || req.user?.userId;

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Error validating user:', error.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const authorizeRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

export const checkOwnershipOrAdmin = (req, res, next) => {
  const { userId } = req.params;
  const loggedInUser = req.user;

  if (loggedInUser.userId === userId || loggedInUser.role === 'admin') {
    return next();
  }

  return res.status(403).json({ message: 'Forbidden. Not your profile.' });
};

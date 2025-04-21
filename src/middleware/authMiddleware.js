import User from '../models/User.js';
import { verifyAccessToken } from '../utils/Tokens/jwtTokens.js';

export const authenticate = async (req, res, next) => {
  const token = req.cookies.token || req.headers["authorization"]?.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Access token missing" });

  try {
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.userId);

    if (!user) return res.status(401).json({ message: "User not found" });

    req.user = user;
    next();
  } catch (err) {
    console.error("Authentication error:", err.message);
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};
export const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden: insufficient role" });
    }
    next();
  };
};



export const checkOwnershipOrAdmin = (paramName = "userId") => {
  return (req, res, next) => {
    const targetUserId = req.params[paramName] || req.body[paramName];
    if (req.user._id.toString() === targetUserId || req.user.isAdmin) {
      return next();
    }
    
    return res.status(403).json({ message: "Forbidden: Not owner or admin" });
  };
};



export const validateUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "User not authenticated" });
  }

  if (req.user.isBanned) {
    return res.status(403).json({ message: "Access denied. You are banned." });
  }

  next();
};

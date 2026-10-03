import User from '../models/User.js';
import { verifyAccessToken, isSessionCurrent } from '../utils/Tokens/jwtTokens.js';
import { sendError } from '../utils/errorResponse.js';
import { canManage, CANNOT_MANAGE_MESSAGE } from '../utils/roles.js';
import { isValidObjectId } from 'mongoose';

export const authenticate = async (req, res, next) => {
  const token = req.cookies?.accessToken || req.headers["authorization"]?.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Access token missing" });

  // 401 (not 403) for a bad/expired token: the frontend's axios interceptor
  // only attempts a refresh on 401, so a 403 here stranded users whose
  // access token had expired while its cookie was still present.
  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    req.log.info({ err }, "Rejected access token");
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  try {
    const user = await User.findById(decoded.userId);

    if (!user) return res.status(401).json({ message: "User not found" });
    if (user.isBanned) return res.status(403).json({ message: "Access denied. You are banned." });
    if (!isSessionCurrent(decoded, user)) return res.status(401).json({ message: "Session has been revoked" });

    req.user = user;
    next();
  } catch (err) {
    return sendError(res, err, "Authentication failed. Please try again.");
  }
};

// Site-wide admin gate. Requires `authenticate` to have run first.
export const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ message: "Forbidden: admin access required" });
  }
  next();
};

// Managing admins is reserved for super admins. Requires `authenticate`.
export const requireSuperAdmin = (req, res, next) => {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ message: "Forbidden: super admin access required" });
  }
  next();
};

// Returns a middleware, so routes must call it: checkOwnershipOrAdmin() or checkOwnershipOrAdmin("otherParam")
//
// Owners always pass. Otherwise the caller must OUTRANK the target account
// (utils/roles.js): any admin used to pass, so an admin could edit a super
// admin's email - and then reset their password.
export const checkOwnershipOrAdmin = (paramName = "userId") => {
  return async (req, res, next) => {
    const targetUserId = req.params[paramName] || req.body[paramName];
    if (req.user._id.toString() === targetUserId) return next();
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: "Forbidden: Not owner or admin" });
    }
    // Malformed id / unknown user: let the route answer 400/404 as usual.
    if (!isValidObjectId(targetUserId)) return next();
    try {
      const target = await User.findById(targetUserId).select("isAdmin isSuperAdmin");
      if (!target || canManage(req.user, target)) return next();
      return res.status(403).json({ message: CANNOT_MANAGE_MESSAGE });
    } catch (err) {
      return sendError(res, err, "Failed to check permissions.");
    }
  };
};

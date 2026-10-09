// routes/authRoutes.js
import express from 'express';
import passport from 'passport';
import { googleEnabled } from '../config/passportConfig.js';
import {handleOAuthSuccess} from '../utils/Tokens/oauthTokens.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { createRateLimiter } from '../config/rateLimiter.js';
import { config } from '../config/env.js';

import {
  registerUser,
  logInUser,
  refreshToken,
  logOutUser,
  requestPasswordReset,
  resetPassword,
  changePassword,
  getCurrentUser,
} from '../controllers/authController.js';

const authRouter = express.Router();

// Brute-force protection for endpoints that take credentials or send email.
// Deliberately NOT applied to /me, /refresh or /logout: the frontend calls
// those on every page load and token expiry, and used to burn through this
// 20-per-15-minutes budget during normal use, locking real users out.
const credentialRateLimiter = createRateLimiter({
  name: 'auth',
  windowMs: config.rateLimits.auth.windowMs,
  limit: config.rateLimits.auth.max,
  message: { message: 'Too many attempts, please try again later.' },
});

// With Google sign-in not configured, its routes send people back to the
// login page with an explanation instead of erroring (the frontend also
// hides the Google button - see GET /api/config).
const requireGoogle = (req, res, next) => {
  if (googleEnabled) return next();
  return res.redirect(`${process.env.FRONTEND_URL}/login?error=google_disabled`);
};

authRouter.get(
  '/google',
  requireGoogle,
  credentialRateLimiter,
  passport.authenticate('google', { scope: ['profile', 'email'] })
);


authRouter.get('/google/callback', requireGoogle, credentialRateLimiter, (req, res, next) => {
  // Not using passport's built-in `failureRedirect` here: it redirects to a
  // relative path on this API server (there is no page at API_HOST/login),
  // not the frontend. A custom callback also lets us surface *why* auth
  // failed (e.g. account_exists) instead of a single generic reason.
  passport.authenticate('google', { session: false }, async (err, user, info) => {
    if (err) {
      req.log.error({ err }, 'OAuth callback error');
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth`);
    }
    if (!user) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=${info?.reason || 'oauth'}`);
    }

    try {
      await handleOAuthSuccess(res, user);
    } catch (error) {
      req.log.error({ err: error }, 'OAuth callback error');
      res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth`);
    }
  })(req, res, next);
});



authRouter.get('/me', authenticate, getCurrentUser);
authRouter.post('/register', credentialRateLimiter, registerUser);
authRouter.post('/login', credentialRateLimiter, logInUser);
authRouter.post('/refresh', refreshToken);
authRouter.post('/logout',logOutUser);
authRouter.post("/forgot-password", credentialRateLimiter, requestPasswordReset);
authRouter.post("/reset-password", credentialRateLimiter, resetPassword);
authRouter.post("/change-password", credentialRateLimiter, authenticate, changePassword);


export default authRouter;

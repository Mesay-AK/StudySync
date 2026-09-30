// routes/authRoutes.js
import express from 'express';
import passport from 'passport';
import {handleOAuthSuccess} from '../utils/Tokens/oauthTokens.js';
import { authenticate } from '../middleware/authMiddleware.js';

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

authRouter.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);


authRouter.get('/google/callback', (req, res, next) => {
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
authRouter.post('/register', registerUser);
authRouter.post('/login',logInUser);
authRouter.post('/refresh', refreshToken);
authRouter.post('/logout',logOutUser);
authRouter.post("/forgot-password", requestPasswordReset);
authRouter.post("/reset-password", resetPassword);
authRouter.post("/change-password", authenticate, changePassword);


export default authRouter;

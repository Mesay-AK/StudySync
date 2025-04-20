// routes/authRoutes.js
import express from 'express';
import passport from 'passport';
import {handleOAuthSuccess} from '../utils/Tokens/oauthTokens.js';
import { validateUser } from '../middleware/authMiddleware.js';

import {
  registerUser,
  logInUser,
  refreshToken,
  logOutUser, 
  requestPasswordReset, 
  resetPassword
} from '../controllers/authController.js';

const authRouter = express.Router();

authRouter.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);


authRouter.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login', session: false }),
  async (req, res) => {
    try {
      await handleOAuthSuccess(res, req.user, true); // `true` = use cookies
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth`);
    }
  }
);



authRouter.post('/register', registerUser);
authRouter.post('/login',validateUser, logInUser);
authRouter.post('/refresh', refreshToken);
authRouter.post('/logout', logOutUser);
authRouter.post("/forgot-password", requestPasswordReset);
authRouter.post("/reset-password", resetPassword);


export default authRouter;

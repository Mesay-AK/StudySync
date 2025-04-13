// routes/authRoutes.js
import express from 'express';
import passport from 'passport';
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
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    
    res.redirect(`${process.env.FRONTEND_URL}/oauth-success?token=${req.user.token}`);
  }
);


authRouter.post('/register', registerUser);
authRouter.post('/login', logInUser);
authRouter.post('/refresh', refreshToken);
authRouter.post('/logout', logOutUser);
authRouter.post("/forgot-password", requestPasswordReset);
authRouter.post("/reset-password", resetPassword);


export default authRouter;

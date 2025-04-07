import express from 'express';
// import passport from 'passport';
import {registerUser, logInUser, refreshToken, logOutUser  } from '../controllers/authController.js';



// authRouter.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
// authRouter.get(
//   '/google/callback',
//   passport.authenticate('google', { failureRedirect: '/login' }),
//   (req, res) => {
//     res.redirect(`${process.env.FRONTEND_URL}/oauth-success?token=${req.user.token}`);
//   }
// );

const authRouter = express.Router();
authRouter.post('/register', registerUser);
authRouter.post('/login', logInUser);
authRouter.post('/refresh', refreshToken);
authRouter.post('/logout', logOutUser);


export default authRouter;

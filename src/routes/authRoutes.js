// import express from 'express';
// import passport from 'passport';
import {registerUser, logInUser, refreshToken, logOutUser  } from '../controllers/authController.js';



// router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
// router.get(
//   '/google/callback',
//   passport.authenticate('google', { failureRedirect: '/login' }),
//   (req, res) => {
//     res.redirect(`${process.env.FRONTEND_URL}/oauth-success?token=${req.user.token}`);
//   }
// );
const router = express.Router();
router.post('/register', registerUser);
router.post('/login', logInUser);
router.post('/refresh', refreshToken);
router.post('/logout', logOutUser);

module.exports = router;

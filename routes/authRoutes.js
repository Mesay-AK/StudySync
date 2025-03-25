import express from 'express';
import { registerUser, loginUser } from '../controllers/authController.js';
import passport from 'passport';

const { registerUser, loginUser } = require('../controllers/authController');

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL}/oauth-success?token=${req.user.token}`);
  }
);
const router = express.Router();
router.post('/register', registerUser);
router.post('/login', loginUser);

module.exports = router;

import passport from 'passport';
import { OAuth2Strategy as GoogleStrategy } from 'passport-google-oauth';
import User from '../models/User.js';

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (token, tokenSecret, profile, done) => {
      try {
        const { email, name, picture } = profile._json;

        // Check if user already exists
        let user = await User.findOne({ email });

        if (!user) {
          // If not, create a new user
          user = new User({
            username: name,
            email,
            displayName: name,
            profilePicture: picture,
            status: true,  // or any default status you want
          });
          await user.save();
        }

        // Return user
        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

export default passport;

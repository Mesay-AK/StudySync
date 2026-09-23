import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
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

        let user = await User.findOne({ email });

        if (!user) {
          let username = email.split('@')[0];
          if (await User.findOne({ username })) {
            username = `${username}-${profile.id.slice(-6)}`;
          }

          user = await User.create({
            username,
            email,
            displayName: name,
            profilePicture: picture,
          });
        }

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

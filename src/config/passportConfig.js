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

        // password has `select: false` - fetch it explicitly since it's the
        // signal for the check below.
        let user = await User.findOne({ email }).select('+password');

        if (user) {
          // A password on the account means it was created via local
          // registration, which never verifies email ownership - anyone
          // could have pre-registered with this address. Auto-linking
          // Google's (verified) email to that account would hand whoever
          // registered it first standing access to the real owner's
          // Google-authenticated account. Only accounts that were already
          // OAuth-only (no password) are safe to log straight into.
          if (user.password) {
            return done(null, false, { reason: 'account_exists' });
          }

          return done(null, user);
        }

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

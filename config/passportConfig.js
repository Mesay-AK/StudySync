import passport from 'passport';
import GoogleStrategy from 'passport-google-oauth20';
import User from '../models/user';
import generateToken from '../utils/generateToken';


passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/api/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = profile.emails[0].value;
      const username = profile.displayName;

      try {
        let user = await User.findOne({ email });

        if (!user) {
          user = await User.create({
            username,
            email,
            password: null, // They are Google-auth users, no local password
            profilePic: profile.photos[0]?.value,
            status: 'offline',
          });
        }

        // Attach JWT to user object so we can use it in redirect
        const token = generateToken(user._id);
        user.token = token;

        done(null, user);
      } catch (error) {
        done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

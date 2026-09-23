import { generateAccessToken, generateRefreshToken } from './jwtTokens.js';
import { setAuthCookies } from './authCookies.js';

export const handleOAuthSuccess = async (res, user) => {
  const payload = {
    userId: user._id,
    email: user.email,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(payload);

  setAuthCookies(res, accessToken, refreshToken);

  return res.redirect(`${process.env.FRONTEND_URL}/oauth-success`);
};

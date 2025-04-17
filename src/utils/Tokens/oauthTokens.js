import { generateAccessToken, generateRefreshToken } from './jwtTokens.js';

export const handleOAuthSuccess = async (res, user, useCookies = false) => {
  const payload = {
    userId: user._id,
    email: user.email,
    role: user.role || 'user',
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = await generateRefreshToken(payload);

  if (useCookies) {
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 60 * 60 * 1000, 
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, 
    });

    return res.redirect(`${process.env.FRONTEND_URL}/oauth-success`);
  } else {
    
    return res.redirect(`${process.env.FRONTEND_URL}/oauth-success?access=${accessToken}&refresh=${refreshToken}`);
  }
};

const isProd = process.env.NODE_ENV === 'production';
const ACCESS_COOKIE_MAX_AGE = (Number(process.env.JWT_ACCESS_TOKEN_EXPIRY) || 900) * 1000;
const REFRESH_COOKIE_MAX_AGE = (Number(process.env.JWT_REFRESH_TOKEN_EXPIRY) || 604800) * 1000;

export const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
};

export const clearAuthCookies = (res) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
};

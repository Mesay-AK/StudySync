const isProd = process.env.NODE_ENV === 'production';
const ACCESS_COOKIE_MAX_AGE = (Number(process.env.JWT_ACCESS_TOKEN_EXPIRY) || 900) * 1000;
const REFRESH_COOKIE_MAX_AGE = (Number(process.env.JWT_REFRESH_TOKEN_EXPIRY) || 604800) * 1000;

// The frontend and API are separate origins (different ports in dev, different
// domains in production - see index.js), so this is a genuinely cross-site
// relationship. SameSite=Strict cookies are never sent on cross-site requests,
// which would silently break auth the moment the two are deployed to
// different domains. Strict/Lax is fine in dev since same-site there covers
// localhost regardless of port; production needs None+Secure to actually work.
const sameSite = isProd ? 'none' : 'strict';

export const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite,
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite,
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
};

export const clearAuthCookies = (res) => {
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
};

import { config } from '../../config/env.js';

const ACCESS_COOKIE_MAX_AGE = (Number(process.env.JWT_ACCESS_TOKEN_EXPIRY) || 900) * 1000;
const REFRESH_COOKIE_MAX_AGE = (Number(process.env.JWT_REFRESH_TOKEN_EXPIRY) || 604800) * 1000;

// From COOKIE_SAMESITE / COOKIE_SECURE / COOKIE_DOMAIN (src/config/env.js).
// Frontend and API on two unrelated sites (e.g. two *.onrender.com hosts)
// need SameSite=None + Secure - the production default. On subdomains of one
// domain (app./api.example.com) prefer COOKIE_SAMESITE=lax and
// COOKIE_DOMAIN=.example.com.
const baseOptions = () => ({
  httpOnly: true,
  secure: config.cookies.secure,
  sameSite: config.cookies.sameSite,
  ...(config.cookies.domain ? { domain: config.cookies.domain } : {}),
});

export const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie('accessToken', accessToken, { ...baseOptions(), maxAge: ACCESS_COOKIE_MAX_AGE });
  res.cookie('refreshToken', refreshToken, { ...baseOptions(), maxAge: REFRESH_COOKIE_MAX_AGE });
};

export const clearAuthCookies = (res) => {
  // Browsers only delete a cookie when domain/path/flags match the ones it
  // was set with - a bare clearCookie() wouldn't log anyone out once
  // COOKIE_DOMAIN is set.
  res.clearCookie('accessToken', baseOptions());
  res.clearCookie('refreshToken', baseOptions());
};

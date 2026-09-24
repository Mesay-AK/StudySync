// In development, the frontend's dev-server port isn't stable (Vite picks the
// next free port whenever the configured one is already in use), so pinning
// CORS to a single FRONTEND_URL breaks the moment a second dev server is
// running. Allow any localhost/127.0.0.1 origin in dev; in production, only
// the exact configured FRONTEND_URL is allowed.
const isLocalhostOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

export const corsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true); // same-origin / non-browser requests (curl, server-to-server)

  if (process.env.NODE_ENV !== 'production' && isLocalhostOrigin(origin)) {
    return callback(null, true);
  }

  if (origin === process.env.FRONTEND_URL) {
    return callback(null, true);
  }

  callback(new Error(`Origin ${origin} not allowed by CORS`));
};

import { config } from './env.js';

// Who may call this API from a browser (and open its Socket.IO connection):
//   - FRONTEND_URL, plus everything in CORS_ORIGINS (comma-separated; exact
//     origins or wildcard subdomains like https://*.example.com);
//   - any localhost/127.0.0.1 port when CORS_ALLOW_LOCALHOST is on (the
//     default outside production - Vite picks a new port whenever the usual
//     one is busy).
export const corsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true); // same-origin / non-browser requests (curl, server-to-server)

  if (config.network.isAllowedOrigin(origin)) return callback(null, true);

  // Not an Error: that bubbled to the global error handler as a 500 (and an
  // error log line) for every request from a foreign origin. Answering with no
  // CORS headers is enough - the browser blocks the response itself.
  callback(null, false);
};

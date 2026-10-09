// Must run before any other local import: several config modules
// (redisClient.js, jwtTokens.js) read process.env at their own top level
// when first imported, and ES modules evaluate each import's full subgraph
// before moving to the next import statement - so if dotenv were required
// later, or transitively imported after one of those modules, the env vars
// it loads would already be too late for them (they'd have already read
// `undefined` - e.g. connecting to Redis with no password at all, silently
// never sending AUTH, rather than a config error).
import 'dotenv/config';
import './compat/slowBufferShim.js';
import { config, configErrors } from './config/env.js';
import express from 'express';
import cors from 'cors';
import http from 'http';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import connectDB from './config/db.js';
import redisClient from './config/redisClient.js';
import passport from './config/passportConfig.js';
import pinoHttp from 'pino-http';
import path from 'path';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { sendError, errorBody } from './utils/errorResponse.js';
import logger from './utils/logger.js';

import authRouter from './routes/authRoutes.js';
import userRouter from './routes/userRoutes.js';
import directMessageRouter from './routes/directMessageRoutes.js';
import chatRoomRouter from './routes/chatRoomRoutes.js';
import notifyRouter from './routes/notificationRoutes.js';
import adminRouter from './routes/adminRoutes.js';
import materialRouter from './routes/materialRoutes.js';
import activityRouter from './routes/activityRoutes.js';
import analyticsRouter from './routes/analyticsRoutes.js';
import announcementRouter from './routes/announcementRoutes.js';
import contactRouter from './routes/contactRoutes.js';
import setupSocket from './config/socket.js';
import { corsOrigin } from './config/corsOrigin.js';
import { authenticate } from './middleware/authMiddleware.js';
import { rejectOperatorKeys } from './middleware/requestGuards.js';
import { authorizeUpload } from './middleware/uploadAccess.js';
import './queues/emailWorker.js';

// Refuse to boot with missing/invalid settings (src/config/env.js), listing
// EVERY problem at once - including unset or copy-pasted-from-.env.example
// JWT secrets, since signing tokens with a public value defeats auth.
if (configErrors.length > 0) {
  logger.error({ problems: configErrors }, `Refusing to start - fix these settings (in .env or the host's environment):\n  - ${configErrors.join('\n  - ')}`);
  process.exit(1);
}

connectDB();

const app = express();
const server = http.createServer(app);

// Behind a load balancer/reverse proxy (Render, Nginx, Cloudflare...), the
// connecting IP is the proxy's. Without this, every visitor shared ONE rate-
// limit bucket. Set TRUST_PROXY to the number of proxy hops (Render: 1).
app.set('trust proxy', config.network.trustProxy);

const io = await setupSocket(server);
// Lets plain HTTP controllers (e.g. getUserStatus) query live presence via
// io.in(userId).fetchSockets() without needing their own reference to the
// Socket.IO server.
app.set('io', io);

// The frontend is a separately-hosted SPA (different origin/port, even
// different domain in production), so it must be able to consume our
// responses cross-origin: fetch uploaded files/attachments, and complete the
// Socket.IO handshake. Helmet's default same-origin Cross-Origin-Resource-Policy
// blocks exactly that - relax it while keeping every other helmet protection.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: corsOrigin, credentials: true }));

// Structured (JSON) request logging - each line carries the same
// correlation id used in the response header and in error logs elsewhere
// (errorResponse.js, authMiddleware.js), via req.log/req.id, so a report of
// "it broke around 3pm" can be traced through multiple log lines instead of
// guessing which ones belong together.
app.use(pinoHttp({
  logger,
  genReqId: (req, res) => {
    const id = randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(rejectOperatorKeys);
app.use(passport.initialize());
// Static /uploads serves files inline (the browser decides how to render
// them). A real "Download" action needs Content-Disposition: attachment,
// which res.download() sets automatically - path.basename() strips any
// directory component so this can't be used to read files outside uploads/.
// Registered before the static mount below, which would otherwise treat
// "download" as the filename and reject it.
app.get('/uploads/:filename/download', authenticate, authorizeUpload, (req, res) => {
  const filePath = path.join(path.resolve(), 'uploads', path.basename(req.params.filename));
  res.download(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: 'File not found' });
  });
});

// Which pages may show an upload inside an <iframe> (attachment previews):
// UPLOADS_FRAME_ANCESTORS, else the allowed frontend origins - not "*".
const uploadFrameAncestors = (() => {
  const { frameAncestors, corsOrigins, allowLocalhost } = config.network;
  const sources = frameAncestors.length
    ? frameAncestors
    : [...corsOrigins, ...(allowLocalhost ? ['http://localhost:*', 'http://127.0.0.1:*'] : [])];
  return sources.length ? sources.join(' ') : "'self'";
})();

// Uploads (including private DM attachments) used to be readable by anyone
// on the internet who had the URL. They now require a logged-in user who is
// allowed to see that particular file (authorizeUpload) - the
// browser sends the httpOnly auth cookie on <img>/<video>/<a> requests to
// this origin, so the frontend's existing markup keeps working unchanged.
app.use(
  '/uploads',
  authenticate,
  authorizeUpload,
  // Uploaded attachments need to render inside the frontend's own preview
  // iframe/lightbox - a different origin from the API even in dev. Helmet's
  // global X-Frame-Options/frame-ancestors above are right for the app's
  // HTML/JSON responses, but would silently leave that preview blank for
  // these static files, so this route gets a relaxed override. Low risk:
  // these are non-executable file downloads, not interactive pages.
  (req, res, next) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', `frame-ancestors ${uploadFrameAncestors}`);
    next();
  },
  express.static(path.join(path.resolve(), 'uploads'))
);

// Rate limiting for credential endpoints lives in authRoutes.js.
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/messages', directMessageRouter);
app.use('/api/chatrooms', chatRoomRouter);
app.use('/api/notifications', notifyRouter);
app.use('/api/admin', adminRouter);
app.use('/api/materials', materialRouter);
app.use('/api/activity', activityRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/announcements', announcementRouter);
app.use('/api/contact', contactRouter);

// Public, non-secret settings the frontend adapts to at runtime (so changing
// them in the backend's .env needs no frontend rebuild).
app.get('/api/config', (req, res) => {
  res.json({
    auth: { google: config.google.enabled },
    uploads: {
      maxAttachmentBytes: config.uploads.maxAttachmentBytes,
      maxMaterialBytes: config.uploads.maxMaterialBytes,
    },
  });
});

app.get('/', (req, res) => {
  res.send('API is running...');
});

// Liveness/readiness probe for load balancers/orchestrators - checks the two
// stateful dependencies the app actually needs, rather than just "process is
// running" (which `GET /` alone can't tell you: it responds even if Mongo or
// Redis are down).
app.get('/health', (req, res) => {
  const mongoUp = mongoose.connection.readyState === 1;
  const redisUp = redisClient.status === 'ready';
  const status = mongoUp && redisUp ? 'ok' : 'degraded';

  res.status(mongoUp ? 200 : 503).json({
    status,
    mongo: mongoUp ? 'up' : 'down',
    redis: redisUp ? 'up' : 'down',
  });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Centralized error handler - catches anything passed to next(err).
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: 'That file is too large.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field.',
      LIMIT_FILE_COUNT: 'Too many files.',
    };
    req.log.error({ err }, 'File upload rejected');
    return res.status(400).json({ message: messages[err.code] || 'File upload failed.' });
  }

  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    req.log.error({ err }, 'Invalid or expired JWT');
    return res.status(401).json({ message: 'Your session is invalid or has expired. Please log in again.' });
  }

  // Body-parser failures: a fixed, translatable message instead of the
  // parser's own technical text ("Unexpected token } in JSON at ...").
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(errorBody('The request was not valid JSON.', 'MALFORMED_JSON'));
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json(errorBody('That request is too large.', 'PAYLOAD_TOO_LARGE'));
  }

  // A 4xx error's message was written for the client (e.g. the upload
  // filters' "Invalid file type!"). A 5xx one is internal - it used to be
  // passed straight to the user; now it's logged and replaced.
  const status = err.status || err.statusCode || 500;
  const clientMessage = status < 500 && err.message ? err.message : 'Something went wrong. Please try again.';
  return sendError(res, err, clientMessage, status);
});

const PORT = config.port;
server.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

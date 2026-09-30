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
import express from 'express';
import cors from 'cors';
import http from 'http';
import helmet from 'helmet';
import { createRateLimiter } from './config/rateLimiter.js';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import connectDB from './config/db.js';
import redisClient from './config/redisClient.js';
import passport from './config/passportConfig.js';
import pinoHttp from 'pino-http';
import path from 'path';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { sendError } from './utils/errorResponse.js';
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
import './queues/emailWorker.js';

// Refuse to boot with unset or copy-pasted-from-.env.example secrets - signing
// tokens with a publicly-known value defeats JWT auth entirely.
const PLACEHOLDER_SECRET = 'change-me';
for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
  if (!process.env[key] || process.env[key] === PLACEHOLDER_SECRET) {
    logger.error(`Refusing to start: ${key} is missing or still set to the placeholder value. Set a real secret in your .env.`);
    process.exit(1);
  }
}

connectDB();

const app = express();
const server = http.createServer(app);

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
app.use(passport.initialize());
app.use(
  '/uploads',
  // Uploaded attachments need to render inside the frontend's own preview
  // iframe/lightbox - a different origin from the API even in dev. Helmet's
  // global X-Frame-Options/frame-ancestors above are right for the app's
  // HTML/JSON responses, but would silently leave that preview blank for
  // these static files, so this route gets a relaxed override. Low risk:
  // these are non-executable file downloads, not interactive pages.
  (req, res, next) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    next();
  },
  express.static(path.join(path.resolve(), 'uploads'))
);

// Static /uploads serves files inline (the browser decides how to render
// them). A real "Download" action needs Content-Disposition: attachment,
// which res.download() sets automatically - path.basename() strips any
// directory component so this can't be used to read files outside uploads/.
app.get('/uploads/:filename/download', (req, res) => {
  const filePath = path.join(path.resolve(), 'uploads', path.basename(req.params.filename));
  res.download(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: 'File not found' });
  });
});

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { message: 'Too many attempts, please try again later.' },
});

app.use('/api/auth', authRateLimiter, authRouter);
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

  return sendError(res, err, err.message || 'Something went wrong. Please try again.', err.status || 500);
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

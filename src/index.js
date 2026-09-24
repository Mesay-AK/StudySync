import './compat/slowBufferShim.js';
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';
import passport from './config/passportConfig.js';
import morgan from 'morgan';
import path from 'path';
import cookieParser from 'cookie-parser';

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

dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);

setupSocket(server);

// The frontend is a separately-hosted SPA (different origin/port, even
// different domain in production), so it must be able to consume our
// responses cross-origin: fetch uploaded files/attachments, and complete the
// Socket.IO handshake. Helmet's default same-origin Cross-Origin-Resource-Policy
// blocks exactly that - relax it while keeping every other helmet protection.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(passport.initialize());
app.use('/uploads', express.static(path.join(path.resolve(), 'uploads')));

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
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

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Centralized error handler - catches anything passed to next(err).
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

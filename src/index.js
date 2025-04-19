import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http';
import connectDB from './config/db.js';
import passport from 'passport';
import morgan from 'morgan';
import path from 'path';

import {authRouter} from './routes/authRoutes.js';
import {userRouter} from './routes/userRoutes.js';
import {directMessageRouter} from './routes/directMessageRoutes.js';
import {chatRoomRouter} from './routes/chatRoomRoutes.js';
import {notifyRouter} from './routes/notificationRoutes.js';
import {adminRouter} from './routes/adminRoutes.js';



import setupSocket from './config/socket.js';

dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);

setupSocket(server);

app.use(express.json());
app.use(cors());
app.use(morgan('dev'));  
app.use(express.urlencoded({ extended: true })); 
app.use(passport.initialize());  
app.use('/uploads', express.static(path.join(path.resolve(), 'uploads'))); 

app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/messages', directMessageRouter);
app.use('/api/chatrooms', chatRoomRouter);
app.use('/api/notifications', notifyRouter);
app.use('/api/admin', adminRouter);

app.get('/', (req, res) => {
  res.send('API is running...');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));

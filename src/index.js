import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http';
import connectDB from './config/db.js';
import passport from 'passport';
import morgan from 'morgan';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import chatRoomRoutes from './routes/chatRoomRoutes.js';
import directMessage from './routes/directMessageRoutes.js';

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

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/messages', directMessage);
app.use('/api/chatrooms', chatRoomRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http'; // <-- import this!
import connectDB from './config/db.js';

import authRoutes from './routes/authRoutes.js';
import usreRoutes from './routes/usreRoutes.js';
import chatRoomRoutes from './routes/chatRoomRoutes.js';
import directMessage from './routes/directMessageRoutes.js';

import setupSocket from './config/socket.js'; // or wherever your socket file is

dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app); // <-- create HTTP server from app

setupSocket(server); // <-- attach socket to the server

app.use(express.json());
app.use(cors());

app.use('/api/auth', authRoutes);
app.use('/api/user', usreRoutes);
app.use('/api/messages', directMessage);
app.use('/api/chatrooms', chatRoomRoutes);

app.get('/', (req, res) => {
  res.send('API is running...');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));

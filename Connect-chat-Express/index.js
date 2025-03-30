import express from 'express';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import cors from 'cors';

import session from 'express-session';
import passport from 'passport';
import GoogleStrategy from 'passport-google-oauth20';
import passportConfig from './config/passportConfig.js';

import authRoutes from './controllers/authController.js'
import messageRoutes from "./routes/messageRoutes.js";
import chatRoomRoutes from "./routes/ChatRoomRoutes.js";



dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);

setupSocket(server);

app.use(express.json());
app.use(cors());


app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

app.use(passport.initialize());
app.use(passport.session());
passportConfig();

app.use('/api/auth', authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/chatrooms", chatRoomRoutes); 

app.get('/', (req, res) => {
  res.send('API is running...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));

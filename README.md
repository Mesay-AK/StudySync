# Study Sync

A real-time chat application built with Node.js, Express, Socket.IO, and MongoDB.

## Features

- Real-time messaging (direct messages & group chats)
- User authentication with JWT & Google OAuth
- File uploads (images, videos)
- Online status & typing indicators
- User blocking & admin panel
- Real-time notifications

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose
- **Real-time**: Socket.IO
- **Auth**: JWT, Passport.js (Google OAuth)
- **Cache**: Redis
- **File Upload**: Multer

## Quick Start

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Setup environment**
   Create `.env` file:

   ```env
   MONGO_URI=mongodb://localhost:27017/connected-chat
   JWT_SECRET=your-jwt-secret
   REDIS_HOST=127.0.0.1
   REDIS_PORT=6379
   PORT=5000
   ```

3. **Start the server**
   ```bash
   npm run dev
   ```

Server runs on `http://localhost:5000`

## API Routes

### Auth (`/api/auth`)

- `POST /register` - Register user
- `POST /login` - Login user
- `POST /logout` - Logout user

### Users (`/api/user`)

- `GET /:userId` - Get user profile
- `PATCH /:userId` - Update profile
- `POST /block` - Block user

### Chat Rooms (`/api/chatrooms`)

- `GET /all` - Get public rooms
- `POST /create` - Create room
- `POST /join-public` - Join room
- `GET /messages/:roomId` - Get messages

### Messages (`/api/messages`)

- `POST /send` - Send direct message
- `GET /direct/:senderId/:receiverId` - Get conversation
- `POST /upload` - Upload files

## Socket Events

- `userConnected` - User connects
- `sendDirectMessage` - Send DM
- `sendPrivateMessage` - Send room message
- `typing` / `stopTyping` - Typing indicators
- `joinRoom` / `leaveRoom` - Room management

## Project Structure

```
src/
├── controllers/    # Business logic
├── models/        # Database models
├── routes/        # API routes
├── middleware/    # Auth & validation
├── utils/         # Helpers & socket handlers
└── config/        # Database & socket setup
```

## Requirements

- Node.js 14+
- MongoDB
- Redis

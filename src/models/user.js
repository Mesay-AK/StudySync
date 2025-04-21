import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const userSchema = Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, default: "" },
    password: { type: String, required: true },
    profilePicture: { type: String, default: "" },
    bio: { type: String, default: "" },
    onlineStatus: { type: String, enum: ["online", "offline"],default: "offline"},
    lastSeen: { type: Date, default: null },
    resetToken: { type: String, default: "" },
    resetPasswordExpires: Date,
    friends: [{ type: Schema.Types.ObjectId, ref: "User" }],
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    unreadMessages: { type: Number, default: 0 },
    isAdmin: { type: Boolean, default: false }, 
    settings: {
      darkMode: { type: Boolean, default: false },
      language: { type: String, default: "en" },
    }

  },
  { timestamps: true }
);

const User = model("User", userSchema);

export default User;

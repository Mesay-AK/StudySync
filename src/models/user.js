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
    role: { type: String, enum: ["user", "admin"], default: "user" },
    lastSeen: { type: Date, default: null },
    resetToken: { type: String, default: "" },
    resetPasswordExpires: Date,
    friends: [{ type: Schema.Types.ObjectId, ref: "User" }],
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    unreadMessages: { type: Number, default: 0 },
    isAdmin: { type: Boolean, default: false }, 
  },
  { timestamps: true }
);

const User = model("User", userSchema);

export default User;

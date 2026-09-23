import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const userSchema = Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    username: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, default: "" },
    // Not required: OAuth-only accounts have no local password.
    password: { type: String, select: false },
    profilePicture: { type: String, default: "" },
    bio: { type: String, default: "" },
    onlineStatus: { type: String, enum: ["online", "offline"],default: "offline"},
    lastSeen: { type: Date, default: null },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    isAdmin: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    settings: {
      darkMode: { type: Boolean, default: false },
      language: { type: String, default: "en" },
    }

  },
  { timestamps: true }
);

const User = model("User", userSchema);

export default User;

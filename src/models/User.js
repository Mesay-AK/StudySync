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
    // "away"/"busy" are user-selectable via PATCH /user/:id/status; presence
    // tracking itself only ever writes online/offline.
    onlineStatus: { type: String, enum: ["online", "offline", "away", "busy"], default: "offline"},
    lastSeen: { type: Date, default: null },
    // Stores a SHA-256 hash of the emailed token, never the token itself, and
    // is never selected by default - it used to be returned by every user
    // lookup (profile, search), letting anyone read a victim's live token.
    resetPasswordToken: { type: String, default: null, select: false },
    resetPasswordExpires: { type: Date, default: null, select: false },
    // Embedded in every access/refresh token; bumping it (password reset or
    // change) invalidates every session issued before.
    tokenVersion: { type: Number, default: 0 },
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

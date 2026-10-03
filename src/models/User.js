import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// Must match the frontend's LANGUAGES (src/lib/preferences.js).
export const SUPPORTED_LANGUAGES = ["en", "es", "fr", "am", "ar"];

// Who may see a user's full profile (controllers/userController.js):
// everyone logged in / people they share a room or conversation with / only them.
export const PROFILE_VISIBILITY = ["everyone", "connections", "private"];

const userSchema = Schema(
  {
    // lowercase/trim are a backstop - callers normalize explicitly via
    // normalizeEmail() too (utils/validation.js).
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
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
    // Above admins (see utils/roles.js). Always also isAdmin. Granted only by
    // scripts/make-admin.js - there is no API to create a super admin.
    isSuperAdmin: { type: Boolean, default: false },
    isBanned: { type: Boolean, default: false },
    settings: {
      // Dark is the app's original (and default) look; false = light theme.
      darkMode: { type: Boolean, default: true },
      language: { type: String, enum: SUPPORTED_LANGUAGES, default: "en" },
      profileVisibility: { type: String, enum: PROFILE_VISIBILITY, default: "connections" },
    }

  },
  { timestamps: true }
);

const User = model("User", userSchema);

export default User;

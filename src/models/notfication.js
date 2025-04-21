import mongoose from "mongoose";
const { Schema, model } = mongoose;

const notificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  type: { type: String, enum: ["message", "request", "other"], default: "other" },
}, { timestamps: true });

export default model("Notification", notificationSchema);

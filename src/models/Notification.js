import mongoose from "mongoose";
const { Schema, model } = mongoose;

const notificationSchema = new Schema({
  recipient: { type: Schema.Types.ObjectId, ref: "User", required: true },
  sender: { type: Schema.Types.ObjectId, ref: "User" },
  content: { type: String, default: "" },
  metadata: { type: Schema.Types.Mixed, default: {} },
  isRead: { type: Boolean, default: false },
  type: { type: String, enum: ["direct_message", "room_message", "request", "other"], default: "other" },
}, { timestamps: true });

notificationSchema.index({ recipient: 1, createdAt: -1 });

export default model("Notification", notificationSchema);

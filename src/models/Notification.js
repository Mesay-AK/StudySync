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

notificationSchema.index({ recipient: 1, updatedAt: -1 });
// Room messages are coalesced into ONE unread notification per (recipient,
// room) - see notifyRoomMembers. Enforced here so concurrent messages can't
// create duplicates.
notificationSchema.index(
  { recipient: 1, "metadata.roomId": 1 },
  { unique: true, partialFilterExpression: { type: "room_message", isRead: false } }
);

export default model("Notification", notificationSchema);

import mongoose from "mongoose";
const { Schema, model } = mongoose;

const DirectMessageSchema = new Schema({
  sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
  receiver: { type: Schema.Types.ObjectId, ref: "User", required: true },
  content: { type: String },
  emojis: [String],
  seen: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
  media: {
    url: String,
    type: { type: String, enum: ["image", "video", "file"] }
  },
  status: { type: String, enum: ["sent", "delivered", "read"], default: "sent" },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

DirectMessageSchema.index({ content: "text", emojis: "text" });

export default model("DirectMessage", DirectMessageSchema);

import mongoose from "mongoose";
const { Schema, model } = mongoose;

const MessageSchema = new Schema({
  sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
  chatRoomId: { type: Schema.Types.ObjectId, ref: "ChatRoom", default: null },
  content: { type: String },
  emojis: [String],
  readBy: [{
    user: { type: Schema.Types.ObjectId, ref: "User" },
    readAt: { type: Date }
  }],
  media: {
    url: String,
    type: { type: String, enum: ["image", "video", "file"] }
  },
  messageType: { type: String, enum: ["text", "image", "video", "file"], default: "text" },
  status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

MessageSchema.index({ content: "text", emojis: "text" });

export default model("Message", MessageSchema);

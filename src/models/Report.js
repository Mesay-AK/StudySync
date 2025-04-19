import mongoose from "mongoose";
const { Schema, model } = mongoose;

const reportSchema = new Schema({
  reporter: { type: Schema.Types.ObjectId, ref: "User", required: true },
  reportedUser: { type: Schema.Types.ObjectId, ref: "User" },
  reportedMessage: { type: Schema.Types.ObjectId, ref: "Message" },
  roomId: { type: Schema.Types.ObjectId, ref: "ChatRoom" }, // new
  reason: { type: String, required: true },
  status: { type: String, enum: ["pending", "reviewed"], default: "pending" },
}, { timestamps: true });

export default model("Report", reportSchema);

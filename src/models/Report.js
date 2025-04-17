import mongoose from "mongoose";

const { Schema, model } = mongoose;

const reportSchema = new Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reportedMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  reason: { type: String, required: true },
  status: { type: String, enum: ["pending", "reviewed"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Report", reportSchema);

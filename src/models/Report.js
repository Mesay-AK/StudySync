// models/Report.js
import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["user", "message"], required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    targetMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    reason: { type: String, required: true },
    status: { type: String, enum: ["pending", "reviewed"], default: "pending" },
  },
  { timestamps: true }
);

export default mongoose.model("Report", reportSchema);

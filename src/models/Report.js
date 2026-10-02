// models/Report.js
import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["user", "message"], required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Room messages live in Message, direct messages in DirectMessage -
    // refPath lets one field populate correctly from either collection.
    targetMessageModel: { type: String, enum: ["Message", "DirectMessage"], default: "Message" },
    targetMessage: { type: mongoose.Schema.Types.ObjectId, refPath: "targetMessageModel" },
    reason: { type: String, required: true },
    status: { type: String, enum: ["pending", "reviewed"], default: "pending" },
  },
  { timestamps: true }
);

// "Already reported" used to be a check-then-insert, so concurrent duplicate
// reports all passed the check. Enforced by the database instead; resolved
// reports drop out of the index so the same target can be reported again.
reportSchema.index(
  { reportedBy: 1, type: 1, targetUser: 1, targetMessage: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

export default mongoose.model("Report", reportSchema);

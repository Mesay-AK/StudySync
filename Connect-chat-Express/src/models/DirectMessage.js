import mongoose from "mongoose";

const { Schema, model } = mongoose;

const DirectMessageSchema = new Schema(
  {
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
    seen: { type: Boolean, default: false }, 
  },
  { timestamps: true }
);

const DirectMessage = model("DirectMessage", DirectMessageSchema);

export default DirectMessage;

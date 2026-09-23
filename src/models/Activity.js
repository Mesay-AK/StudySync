import mongoose from "mongoose";
const { Schema, model } = mongoose;

const ActivitySchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  type: {
    type: String,
    enum: ["room_created", "room_joined", "room_left", "material_uploaded"],
    required: true,
  },
  description: { type: String, required: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

ActivitySchema.index({ user: 1, createdAt: -1 });

export default model("Activity", ActivitySchema);

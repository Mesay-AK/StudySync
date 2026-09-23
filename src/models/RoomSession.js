import mongoose from "mongoose";
const { Schema, model } = mongoose;

// One document per (user, room) visit - powers real "study time" analytics
// instead of a fabricated number. Opened on socket joinRoom, closed on
// leaveRoom or disconnect.
const RoomSessionSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  room: { type: Schema.Types.ObjectId, ref: "ChatRoom", required: true },
  joinedAt: { type: Date, required: true },
  leftAt: { type: Date, default: null },
  durationSeconds: { type: Number, default: 0 },
}, { timestamps: true });

RoomSessionSchema.index({ user: 1, joinedAt: -1 });

export default model("RoomSession", RoomSessionSchema);

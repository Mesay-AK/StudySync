import mongoose from "mongoose";
const { Schema, model } = mongoose;

const MaterialSchema = new Schema({
  uploader: { type: Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  description: { type: String, default: "" },
  subject: { type: String, default: "" },
  tags: [{ type: String }],
  fileUrl: { type: String, required: true },
  fileType: { type: String, required: true }, // pdf | doc | docx | jpg | png | mp4 | mp3 | file ...
  size: { type: Number, required: true }, // bytes
  downloads: { type: Number, default: 0 },
  likedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  bookmarkedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

MaterialSchema.index({ name: "text", description: "text", tags: "text", subject: "text" });

export default model("Material", MaterialSchema);

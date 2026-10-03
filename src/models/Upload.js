import mongoose from "mongoose";
const { Schema, model } = mongoose;

// Who uploaded each stored file, so access can be checked per file (see
// middleware/uploadAccess.js) - an attachment isn't attached to any message
// until after it's uploaded, and only its uploader may see it until then.
const UploadSchema = new Schema({
  filename: { type: String, required: true, unique: true },
  uploader: { type: Schema.Types.ObjectId, ref: "User", required: true },
  purpose: { type: String, enum: ["chat", "material"], required: true },
}, { timestamps: true });

export default model("Upload", UploadSchema);

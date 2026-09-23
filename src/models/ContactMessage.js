import mongoose from "mongoose";
const { Schema, model } = mongoose;

const ContactMessageSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
}, { timestamps: true });

export default model("ContactMessage", ContactMessageSchema);

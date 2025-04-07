import mongoose from "mongoose";
const { Schema, model } = mongoose;

const notificationSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    type: {
        type: String,
        enum: ["message", "request", "other"],
        default: "other",
        required: true,
    }
});

const Notification = model("Notification", notificationSchema);

export default Notification;



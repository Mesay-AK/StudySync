import mongoose from "mongoose";

const userSchema = mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true},
        userNmae: {
            type: String,
            required: true,
            unique: true
        },
        password: {
            type: String,
            required: true
        },
        profilePic: {
            type: String,
            default: "",
        },
        newMessagePopup: {
            type: Boolean,
            default: true,
        },
        unreadMessage: {
            type: Boolean,
            default: false,
        },
        unreadNotification: {
            type: Boolean,
            default: false,
        },
        role: {
            type: String,
            enum: ["user", "root"],
            default: "user",
        },
        resetToken: {
            type: String,
            default: "",
        },
        expireToken: {
            type: Date,
            default: Date.now(),
        },
        status: {
            type: String,
            enum: ["online", "offline"],
            default: "offline",
        },
        friends: [
            {
                type: ObjectId,
                ref: "user",
            },
        ],
    },
    {timestamps: true}
)

const User = mongoose.model("user", userSchema)

export default User;
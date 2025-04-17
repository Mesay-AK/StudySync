import mongoose from "mongoose";

const {Schema, model} = mongoose;

const MessageSchema = new Schema(
    {
        sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
        receiver: {type: Schema.Types.ObjectId, ref:"User", required: true},
        chatRoomId: {type: Schema.Types.ObjectId, ref:"ChatRoom", default: null},
        content: {type: String, required: true},
        emojis: [String],

        messageType: {type: String, enum: ["text", "image", "video", "file"], default: null},
        status: {
        type: String, enum: ['sent', 'delivered', 'read'],
        default: 'sent',
        },
        isDeleted: {type: Boolean, default: false},
        createdAt: {type: Date, default: Date.now},
        updatedAt: {type: Date, default: Date.now}
    },
    {
        timestamps: true,
        
    }
)


const Message = model("Message", MessageSchema);
export default Message;
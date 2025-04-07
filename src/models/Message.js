import mongoose from "mongoose";

const {Schema, model} = mongoose;

const MessageSchema = new Schema(
    {
        sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
        receiver: {type: Schema.Types.ObjectId, ref:"User", required: true},
        chatRoomId: {type: Schema.Types.ObjectId, ref:"ChatRoom", default: null},
        content: {type: String, required: true},
        messageType: {type: String, enum: ["text", "image", "video", "file"], default: "text"},
        
    }
)


const Message = model("Message", MessageSchema);
export default Message;
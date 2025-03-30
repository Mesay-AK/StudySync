import mongoose from "mongoose";

const {Schema, model}  = mongoose;

const ChatRoomSchema = new Schema(
    {
        name: {type:String, required: true},
        type: {type: String, enum: ["public", "private"], default: "public"},
        members: [
            {type: Schema.Types.ObjectId, ref: "User"}
        ],
        admins: [{ type: Schema.Types.ObjectId, ref: "User" }],
        messages: [
            {type: Schema.Types.ObjectId, ref: "Message"}
        ],
        createdBy: {type: Schema.Types.ObjectId, ref: "User"},
        invitedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
        isDeleted: {type: Boolean, default: false},

    },
    {timestamps: true}

);

const ChatRoom = model("ChatRoom", ChatRoomSchema);

export default ChatRoom;



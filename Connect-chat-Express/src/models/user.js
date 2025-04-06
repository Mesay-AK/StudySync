import mongoose from 'mongoose';

const userSchema = mongoose.Schema(
    {
        email: {type: String, required: true, unique: true},
        username: {type: String, required: true, unique: true},
        password: {type: String, required: true},
        profilePicture: {type: String, default: ""},
        bio: {type: String, default: ""},
        status: {type: Boolean , default: false},
        role: {type: String, enum: ["user", "admin"], default: "user"},
        lastSeen: { type: Date, default: null } ,
        resetToken: {type: String, default: ""},
        friends: [
            {type: Schema.Types.ObjectId, ref: "User"}
        ],
        blockedUsers:[
            {type: Schema.Types.ObjectId, ref: "User"}
        ],
        unreadMessages: { type: Number, default: 0 },
    },
    {timestamps: true}
);


const User = model("User", userSchema);

export default User;
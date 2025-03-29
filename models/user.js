import mongoose from 'mongoose';

const userSchema = mongoose.Schema(
    {
        email: {type: String, required: true, unique: true},
        username: {type: String, required: true, unique: true},
        password: {type: String, required: true},
        profilePicture: {type: String, default: ""},
        bio: {type: String, default: ""},
        status: {type: String, enum: ["Online, Offline"], default: "Offline"},
        accountType: {type: String, enum: ["user", "admin"], default: "user"},
        resetToken: {type: String, default: ""},
        friends: [
            {type: Schema.Types.ObjectId, ref: "User"}
        ],
        blockedUsers:[
            {type: Schema.Types.ObjectId, ref: "User"}
        ],
        
    },
    {timestamps: true}
);


const User = model("User", userSchema);

export default User;
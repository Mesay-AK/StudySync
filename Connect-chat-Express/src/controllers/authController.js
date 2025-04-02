import bcrypt from 'bcryptjs';
import { User} from "../models/user.js";
import generateToken from "../utils/generateToken.js";
import e from 'cors';
// import { validationResult } from 'express-validator';


const registerUser = async (req, res) => {
    const {userName, email, password} = req.body;

    if (!userName || !email || !password) {
        return res.status(400).json({message: "Please fill in all fields"});
    }
    const userExists = await User.findOne({email});

    if (userExists) {
        return res.status(400).json({message: "User already exists"});
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
        userName,
        email,
        password: hashedPassword
    });

    if (user){
        res.status(201).json({
            _id: user._id,
            userName: user.userName,
            email: user.email,
            token: generateToken(user._id)
        });

    }else {
        res.status(400).json({message: "Invalid user data"});
    }
}


const loginUser = async (req, res) => {
    const {email, password} = req.body;

    if (!email || !password) {
        return res.status(400).json({message: "Please fill in all fields"});
    }

    const user = await User.findOne({
        email
    });

    if (user && (await user.matchPassword(password))) {
        res.json({
            _id: user._id,
            userName: user.userName,
            email: user.email,
            token: generateToken(user._id)
        });
    }else {
        res.status(401).json({message: "Invalid email or password"});
    }
};

export {registerUser, loginUser};
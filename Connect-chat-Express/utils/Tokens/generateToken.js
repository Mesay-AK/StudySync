import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const genrateToken = (payload) =>{
    payload.sessionId = uuidv4();
    payload.exp = Math.floor.now() / 1000 + (60 * 60 * 24 * 30);
    return jwt.sign(payload, process.env.JWT_SECRET,{
        expiresIn: "30d"
    });
};

export default genrateToken;
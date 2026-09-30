import mongoose from "mongoose";
import dotenv from "dotenv";
import logger from "../utils/logger.js";

dotenv.config()

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI)
        logger.info("MongoDB Connected.")
    }catch(error){
        logger.error({ err: error }, "MongoDB connection failed")
        process.exit(1)
    }
};


export default connectDB
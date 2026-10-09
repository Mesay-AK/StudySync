import mongoose from "mongoose";
import { config } from "./env.js";
import logger from "../utils/logger.js";


const connectDB = async () => {
    try {
        await mongoose.connect(config.mongoUri)
        logger.info("MongoDB Connected.")
    }catch(error){
        logger.error({ err: error }, "MongoDB connection failed")
        process.exit(1)
    }
};


export default connectDB
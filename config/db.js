import mongoose from "mongoose";



const connectDataBase = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true, 
            useUnifiedTopology: true,
            useCreateINdex: true,
        }) 
        console.log("MongoDB Connected.")
    }catch(errors){
        console.log(errors)
        process.exit(1)
    }
};

module.exports = connectDataBase
import bcrypt from 'bcryptjs';


const hashPassword = async(password) {
    try {
        const saltRounds = 10; 
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        return hashedPassword;

    } catch (error) {

        console.error("Error hashing password:", error);
        throw new Error("Failed to hash password.");
    }
}
const comparePassword = async(password, hashedPassword) {
    try {

        return await bcrypt.compare(password, hashedPassword);

    } catch (error) {

        console.error("Error comparing password:", error);
        throw new Error("Failed to compare password.");
    }
}


export{
    hashPassword,
    comparePassword
}
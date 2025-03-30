import ChatRoom from "../models/ChatRoom";

const createRoom = async (req, res) => {
    try{
        const {name, type, creatorId} = req.body;
        const newRoom = new ChatRoom({
            name, 
            type, 
            createdBy: creatorId,
            members: [creatorId],
            admins:[creatorId],
        });

        await chatRoom.save();
        res.status(201).json(newRoom);
    }catch(eroror){
        console.error("Error creating chat room:", error);
        res.status(500).json({message: "Internal server error"});
    }
}


const getChatRooms = async (req, res) => {
    try{
        const rooms = await ChatRoom.find({type:"public"});
        res.status(201).json({"rooms": rooms});
    }catch{
        console.error("Error fetching chat rooms:", error);
        res.status(500).json({message: "Internal server error"});
    }
}


const joinRoom = async (req, res) => {
    try{
        const {userId, roomId} = req.body;
        const room = await ChatRoom.findById(req.params.roomId);

        if(!room) return res.status(404).json({message: "Room not found"});

        if(!room.members.includes(userId)) {
            room.members.push(userId);
            await room.save();
        }
        res.status(200).json({message: "Joined room successfully", room});

    }catch(error){
        console.error("Error joining chat room:", error);
        res.status(500).json({message: "Internal server error"});
    }
}


const leaveRoom = async (req, res) => {
    try{
        const {userId, roomId} = req.body;
        const room = await ChatRoom.findById(req.params.roomId);

        if(!room) return res.status(404).json({message: "Room not found"});

        if(room.members.includes(userId)) {
            room.members = room.members.filter(member => member !== userId);
            await room.save();
        }
        res.status(200).json({message: "Left room successfully", room});

    }catch(error){
        console.error("Error leaving chat room:", error);
        res.status(500).json({message: "Internal server error"});
    }
}




const deleteRoom = async (req, res) => {
    try{
        const room = await ChatRoom.findById(req.params.roomId);

        if(!room) return res.status(404).json({message: "Room not found"});

        await room.deleteOne();
        res.status(200).json({message: "Room deleted successfully"});

    }catch(error){
        console.error("Error deleting chat room:", error);
        res.status(500).json({message: "Internal server error"});
    }
}


const getRoomMessages = async (req, res) => {
    try{
        const room = await ChatRoom.findById(req.params.roomId).populate("messages");

        if(!room) return res.status(404).json({message: "Room not found"});

        res.status(200).json({messages: room.messages});

    }catch(error){
        console.error("Error fetching chat room messages:", error);
        res.status(500).json({message: "Internal server error"});
    }
}

export {createRoom, getChatRooms, joinRoom, leaveRoom, deleteRoom, getRoomMessages};
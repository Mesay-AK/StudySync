import {Server, Socket} from "socket.io";
import Message from "../models/Message";


const userOnline = new Map()

const setupSocket = (server) => {
    const io = new Server(server, {cors: {origin: "*"}});

    io.on("connection", (Socket) => {
        console.log(`User Connected: ${Socket.id}`);

        Socket.on("userConnected", (userId))
    })
}


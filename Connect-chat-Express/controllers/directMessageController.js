import express from "express";
import DirectMessage from "../models/DirectMessage.js";


const SendMessage = async (req, res) => {
    try{
        const { sender, receiver, content } = req.body;
        const newMessage = new DirectMessage({ sender, receiver, content });
        await newMessage.save();
        res.status(200).json(newMessage);
    }catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error sending message" });
    }
}


const GetMessages = async (req, res) => {
    try{
        const { sender, receiver } = req.params;
        const messages = await DirectMessage.find({
            $or: [
                { sender, receiver },
                { sender: receiver, receiver: sender }
            ]
        }).sort({ createdAt: 1 });
        res.status(200).json(messages);
    }catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching messages" });
    }
}


const DeleteMessage = async (req, res) => {
    try{
        const { messageId } = req.params;
        await DirectMessage.findByIdAndDelete(messageId);
        res.status(200).json({ message: "Message deleted successfully" });
    }catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error deleting message" });
    }
}

const MarkAsSeen = async (req, res) => { 
    try{
        const { messageId } = req.params;
        const message = await DirectMessage.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: "Message not found" });
        }
        message.seen = true;
        await message.save();
        res.status(200).json({ message: "Message marked as seen" });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error marking message as seen" });
    }
}


const directMessageController = {
    SendMessage,
    GetMessages,
    DeleteMessage,
    MarkAsSeen
};
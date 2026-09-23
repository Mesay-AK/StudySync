import ContactMessage from "../models/ContactMessage.js";
import { sendEmail } from "../utils/emailService.js";

export const submitContactMessage = async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return res.status(400).json({ message: "Name, email, and message are required." });
    }

    const contactMessage = await ContactMessage.create({ name, email, message });

    if (process.env.EMAIL_FROM) {
      sendEmail({
        to: process.env.EMAIL_FROM,
        subject: `New contact form message from ${name}`,
        html: `<p><strong>From:</strong> ${name} (${email})</p><p>${message}</p>`,
      }).catch((err) => console.error("Failed to send contact notification email:", err.message));
    }

    res.status(201).json({ message: "Thanks for reaching out! We'll get back to you soon.", id: contactMessage._id });
  } catch (error) {
    console.error("Error submitting contact message:", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
};

export const getContactMessages = async (req, res) => {
  try {
    const messages = await ContactMessage.find().sort({ createdAt: -1 });
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch contact messages" });
  }
};

export const markContactMessageRead = async (req, res) => {
  try {
    const message = await ContactMessage.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
    if (!message) return res.status(404).json({ message: "Message not found" });
    res.status(200).json(message);
  } catch (error) {
    res.status(500).json({ message: "Failed to update message" });
  }
};

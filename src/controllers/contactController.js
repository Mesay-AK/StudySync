import ContactMessage from "../models/ContactMessage.js";
import { sendError } from "../utils/errorResponse.js";
import { emailQueue } from "../queues/emailQueue.js";
import { escapeHtml } from "../utils/escapeHtml.js";
import { isNonEmptyString } from "../utils/validation.js";

export const submitContactMessage = async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!isNonEmptyString(name) || !isNonEmptyString(email) || !isNonEmptyString(message)) {
      return res.status(400).json({ message: "Name, email, and message are required." });
    }

    const contactMessage = await ContactMessage.create({ name, email, message });

    if (process.env.EMAIL_FROM) {
      emailQueue.add("contact-notification", {
        to: process.env.EMAIL_FROM,
        subject: `New contact form message from ${name}`,
        // Every field is attacker-controlled (no auth on this form) and lands
        // in staff inboxes as HTML - escaped so it can't become a link/markup.
        html: `<p><strong>From:</strong> ${escapeHtml(name)} (${escapeHtml(email)})</p><p>${escapeHtml(message)}</p>`,
      }).catch((err) => req.log.error({ err }, "Failed to enqueue contact notification email"));
    }

    res.status(201).json({ message: "Thanks for reaching out! We'll get back to you soon.", id: contactMessage._id });
  } catch (error) {
    return sendError(res, error, "Failed to send your message. Please try again.");
  }
};

export const getContactMessages = async (req, res) => {
  try {
    const messages = await ContactMessage.find().sort({ createdAt: -1 });
    res.status(200).json(messages);
  } catch (error) {
    return sendError(res, error, "Failed to fetch contact messages.");
  }
};

export const markContactMessageRead = async (req, res) => {
  try {
    const message = await ContactMessage.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true });
    if (!message) return res.status(404).json({ message: "Message not found" });
    res.status(200).json(message);
  } catch (error) {
    return sendError(res, error, "Failed to update message.");
  }
};

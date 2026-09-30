import nodemailer from "nodemailer";
import logger from "./logger.js";

// Postmark's SMTP endpoint accepts the same API token as both username and password.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.postmarkapp.com",
  port: Number(process.env.SMTP_PORT) || 587,
  auth: {
    user: process.env.POSTMARK_API_KEY,
    pass: process.env.POSTMARK_API_KEY,
  },
});

export const sendEmail = async ({ to, subject, html }) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html
    });
  } catch (error) {
    logger.error({ err: error, to, subject }, "Error sending email");
    throw new Error("Email sending failed");
  }
};


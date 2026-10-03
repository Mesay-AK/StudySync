import path from "path";
import Upload from "../models/Upload.js";
import DirectMessage from "../models/DirectMessage.js";
import Message from "../models/Message.js";
import ChatRoom from "../models/ChatRoom.js";
import Material from "../models/Material.js";
import { sendError } from "../utils/errorResponse.js";

// Per-file authorization for /uploads (runs after `authenticate`). Being
// logged in used to be enough to read ANY upload, including other people's
// private DM attachments. A file is now readable by:
//   - its uploader, and site admins;
//   - either participant of a (non-deleted) direct message that attaches it;
//   - members of the room whose (non-deleted) message attaches it;
//   - any logged-in user, if it's a (non-deleted) study material.
// Everyone else gets a 404 rather than a 403, so the response doesn't even
// confirm the file exists.
const canRead = async (user, filename) => {
  if (user.isAdmin) return true;

  const upload = await Upload.findOne({ filename }).select("uploader");
  if (upload && upload.uploader.equals(user._id)) return true;

  const url = `${process.env.BASE_URL}/uploads/${filename}`;

  if (await Material.exists({ fileUrl: url, isDeleted: false })) return true;

  if (await DirectMessage.exists({
    "media.url": url,
    isDeleted: false,
    $or: [{ sender: user._id }, { receiver: user._id }],
  })) return true;

  const roomIds = await Message.find({ "media.url": url, isDeleted: false }).distinct("chatRoomId");
  if (roomIds.length && await ChatRoom.exists({ _id: { $in: roomIds }, members: user._id, isDeleted: false })) return true;

  return false;
};

export const authorizeUpload = async (req, res, next) => {
  // Static route: req.path is "/<file>"; download route: :filename param.
  const raw = req.params.filename ?? req.path;
  let filename;
  try {
    filename = path.basename(decodeURIComponent(raw));
  } catch {
    return res.status(404).json({ message: "File not found" });
  }

  try {
    if (await canRead(req.user, filename)) return next();
    return res.status(404).json({ message: "File not found" });
  } catch (error) {
    return sendError(res, error, "Failed to load the file.");
  }
};

import Material from "../models/Material.js";
import { logActivity } from "../utils/activityLogger.js";
import { sendError } from "../utils/errorResponse.js";
import { clampPagination } from "../utils/pagination.js";
import { isOptionalString } from "../utils/validation.js";
import fs from "fs/promises";
import Upload from "../models/Upload.js";
import path from "path";
import logger from "../utils/logger.js";

const EXT_TO_FILE_TYPE = {
  ".pdf": "pdf",
  ".doc": "doc",
  ".docx": "docx",
  ".ppt": "ppt",
  ".pptx": "pptx",
  ".txt": "txt",
  ".jpg": "jpg",
  ".jpeg": "jpg",
  ".png": "png",
  ".gif": "gif",
  ".mp4": "mp4",
  ".avi": "avi",
  ".mkv": "mkv",
  ".mp3": "mp3",
  ".wav": "wav",
};

const deriveFileType = (originalName) => {
  const ext = originalName.slice(originalName.lastIndexOf(".")).toLowerCase();
  return EXT_TO_FILE_TYPE[ext] || "file";
};

const toClientShape = (material, viewerId) => ({
  id: material._id,
  name: material.name,
  description: material.description,
  subject: material.subject,
  tags: material.tags,
  type: material.fileType,
  size: material.size,
  fileUrl: material.fileUrl,
  uploader: material.uploader?.displayName || material.uploader?.username || "Unknown",
  uploaderId: material.uploader?._id,
  uploadDate: material.createdAt,
  downloads: material.downloads,
  likes: material.likedBy.length,
  isLiked: viewerId ? material.likedBy.some((id) => id.toString() === viewerId) : false,
  isBookmarked: viewerId ? material.bookmarkedBy.some((id) => id.toString() === viewerId) : false,
});

export const uploadMaterial = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const { name, description = "", subject = "", tags = "" } = req.body;

    // Multipart fields can arrive repeated (an array) or bracketed (an
    // object) - tags.split() on either used to crash with a 500.
    const tagList = Array.isArray(tags) ? tags : [tags];
    if (!isOptionalString(name) || typeof description !== "string" || typeof subject !== "string" ||
        !tagList.every((t) => typeof t === "string")) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ message: "Name, description, subject and tags must be text." });
    }

    const material = await Material.create({
      uploader: req.user.id,
      name: name || req.file.originalname,
      description,
      subject,
      tags: tagList.flatMap((t) => t.split(",")).map((t) => t.trim()).filter(Boolean),
      fileUrl: `${process.env.BASE_URL}/uploads/${req.file.filename}`,
      fileType: deriveFileType(req.file.originalname),
      size: req.file.size,
    });

    await Upload.create({ filename: req.file.filename, uploader: req.user.id, purpose: "material" });

    await logActivity({
      user: req.user.id,
      type: "material_uploaded",
      description: `Uploaded the material "${material.name}"`,
      metadata: { materialId: material._id, name: material.name },
    });

    res.status(201).json(toClientShape(material, req.user.id));
  } catch (error) {
    return sendError(res, error, "Failed to upload material.");
  }
};

export const getMaterials = async (req, res) => {
  try {
    const { subject, fileType, search, sortBy = "date", page = 1, limit = 12 } = req.query;

    const query = { isDeleted: false };
    if (subject && subject !== "all") query.subject = subject;
    // A comma-separated list selects a group (e.g. "doc,docx" for documents).
    if (fileType && fileType !== "all") {
      const types = fileType.split(",").map((t) => t.trim()).filter(Boolean);
      query.fileType = types.length > 1 ? { $in: types } : types[0];
    }
    if (search) query.$text = { $search: search };

    const sortMap = {
      date: { createdAt: -1 },
      name: { name: 1 },
      downloads: { downloads: -1 },
      size: { size: -1 },
    };

    const total = await Material.countDocuments(query);
    const { page: safePage, limit: safeLimit, skip } = clampPagination(page, limit);
    let materials;

    if (sortBy === "likes") {
      // Sorted and paginated in the database (this used to load EVERY
      // matching material into memory to sort by likedBy.length).
      const page = await Material.aggregate([
        { $match: query },
        { $addFields: { likeCount: { $size: "$likedBy" } } },
        { $sort: { likeCount: -1, createdAt: -1, _id: 1 } },
        { $skip: skip },
        { $limit: safeLimit },
      ]);
      materials = await Material.populate(page.map((doc) => Material.hydrate(doc)), { path: "uploader", select: "username displayName" });
    } else {
      materials = await Material.find(query)
        .populate("uploader", "username displayName")
        .sort(sortMap[sortBy] || sortMap.date)
        .skip(skip)
        .limit(safeLimit);
    }

    res.status(200).json({
      materials: materials.map((m) => toClientShape(m, req.user.id)),
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
    });
  } catch (error) {
    return sendError(res, error, "Failed to fetch materials.");
  }
};

// Like/bookmark used to load the document, edit the array in memory and
// save() it back: a double-click recorded two likes, and an unlike racing
// other users' likes failed with a 500 (version conflict) and was lost. Each
// toggle is now one atomic conditional update - $pull if the user is in the
// set, otherwise $addToSet (which can never add them twice).
const toggleMembership = async (materialId, field, userId) => {
  const scope = { _id: materialId, isDeleted: false };

  const removed = await Material.findOneAndUpdate(
    { ...scope, [field]: userId },
    { $pull: { [field]: userId } },
    { new: true }
  );
  if (removed) return { material: removed, isSet: false };

  const added = await Material.findOneAndUpdate(scope, { $addToSet: { [field]: userId } }, { new: true });
  if (!added) return null;
  return { material: added, isSet: true };
};

export const toggleLike = async (req, res) => {
  try {
    const result = await toggleMembership(req.params.id, "likedBy", req.user.id);
    if (!result) return res.status(404).json({ message: "Material not found" });

    res.status(200).json({ likes: result.material.likedBy.length, isLiked: result.isSet });
  } catch (error) {
    return sendError(res, error, "Failed to update like.");
  }
};

export const toggleBookmark = async (req, res) => {
  try {
    const result = await toggleMembership(req.params.id, "bookmarkedBy", req.user.id);
    if (!result) return res.status(404).json({ message: "Material not found" });

    res.status(200).json({ isBookmarked: result.isSet });
  } catch (error) {
    return sendError(res, error, "Failed to update bookmark.");
  }
};

export const registerDownload = async (req, res) => {
  try {
    const material = await Material.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { $inc: { downloads: 1 } },
      { new: true }
    );
    if (!material) return res.status(404).json({ message: "Material not found" });

    res.status(200).json({ fileUrl: material.fileUrl, downloads: material.downloads });
  } catch (error) {
    return sendError(res, error, "Failed to register download.");
  }
};

export const deleteMaterial = async (req, res) => {
  try {
    const material = await Material.findOne({ _id: req.params.id, isDeleted: false });
    if (!material) return res.status(404).json({ message: "Material not found" });

    if (material.uploader.toString() !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ message: "Not authorized to delete this material" });
    }

    material.isDeleted = true;
    await material.save();

    // The record stays (soft delete, for history/analytics), but the file
    // itself goes: a "deleted" material used to remain downloadable by anyone
    // holding its URL - including content an admin removed for moderation.
    // basename() keeps this confined to the uploads directory.
    const filePath = path.join(path.resolve(), "uploads", path.basename(material.fileUrl));
    await fs.unlink(filePath).catch((err) => {
      if (err.code !== "ENOENT") logger.error({ err, materialId: material._id }, "Failed to delete material file");
    });

    res.status(200).json({ message: "Material deleted" });
  } catch (error) {
    return sendError(res, error, "Failed to delete material.");
  }
};

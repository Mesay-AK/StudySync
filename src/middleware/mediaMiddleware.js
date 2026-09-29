import multer from "multer";
import fs from "fs";

const uploadDirectory = "./uploads";
fs.mkdirSync(uploadDirectory, { recursive: true });


const imageVideoMimeTypes = ["image/jpeg", "image/png", "image/gif", "video/mp4", "video/avi", "video/mkv"];

// Chat attachments and study materials both need to cover documents, not just
// images/video - a single shared allowlist keeps them consistent.
const documentMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "audio/mpeg",
  "audio/wav",
];

const mediaMimeTypes = [...imageVideoMimeTypes, ...documentMimeTypes];

// The stored file's extension must come from the VERIFIED mimetype, never
// from the client-supplied original filename - otherwise an attacker can
// pass fileFilter with an allowed mimetype (e.g. image/png) while naming the
// upload "evil.html"/"evil.svg", and express.static would then serve it back
// with an HTML/SVG content-type, letting embedded script execute (stored XSS).
const mimeTypeExtensions = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/avi": ".avi",
  "video/mkv": ".mkv",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "text/plain": ".txt",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    const ext = mimeTypeExtensions[file.mimetype];
    if (!ext) {
      return cb(new Error("Invalid file type."));
    }
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  }
});

const mediaFileFilter = (req, file, cb) => {
  if (mediaMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error("Invalid file type! Images, videos, PDFs, and common document formats are allowed.");
    error.status = 400;
    cb(error, false);
  }
};

const upload = multer({
  storage,
  fileFilter: mediaFileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }
});

export const uploads = upload.single("media");

const materialMimeTypes = mediaMimeTypes;

const materialFileFilter = (req, file, cb) => {
  if (materialMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error("Invalid file type for a study material.");
    error.status = 400;
    cb(error, false);
  }
};

const materialUpload = multer({
  storage,
  fileFilter: materialFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 },
});

export const materialUploads = materialUpload.single("file");
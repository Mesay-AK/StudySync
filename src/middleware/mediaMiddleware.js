import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDirectory = "./uploads";
fs.mkdirSync(uploadDirectory, { recursive: true });


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory); 
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)); 
  }
});

const mediaMimeTypes = ["image/jpeg", "image/png", "image/gif", "video/mp4", "video/avi", "video/mkv"];

const mediaFileFilter = (req, file, cb) => {
  if (mediaMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type! Only images and videos are allowed."), false);
  }
};

const upload = multer({
  storage,
  fileFilter: mediaFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

export const uploads = upload.single("media");

const materialMimeTypes = [
  ...mediaMimeTypes,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "audio/mpeg",
  "audio/wav",
];

const materialFileFilter = (req, file, cb) => {
  if (materialMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type for a study material."), false);
  }
};

const materialUpload = multer({
  storage,
  fileFilter: materialFileFilter,
  limits: { fileSize: 25 * 1024 * 1024 },
});

export const materialUploads = materialUpload.single("file");
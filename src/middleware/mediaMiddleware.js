import multer from "multer";
import path from "path";

// Set the destination folder for uploads
const uploadDirectory = "./uploads";

// Configure multer storage with custom filename and file type validation
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory); // Specify folder to save files
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)); // Generate unique file name
  }
});

// File type validation (only allow images, videos, and general files)
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/gif", "video/mp4", "video/avi", "video/mkv"];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);  // Accept the file
  } else {
    cb(new Error("Invalid file type! Only images and videos are allowed."), false);  // Reject the file
  }
};

// Set up multer instance with storage and file filter
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }  // Set file size limit to 10MB
});

// Export the upload middleware function for use in routes
export const uploads = upload.single("media");  
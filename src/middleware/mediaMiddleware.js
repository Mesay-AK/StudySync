import multer from "multer";
import path from "path";


const uploadDirectory = "./uploads";


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory); 
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)); 
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ["image/jpeg", "image/png", "image/gif", "video/mp4", "video/avi", "video/mkv"];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);  
  } else {
    cb(new Error("Invalid file type! Only images and videos are allowed."), false); 
  }
};


const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }  
});



export const uploads = upload.single("media");  
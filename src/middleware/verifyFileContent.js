import { fileTypeFromFile } from "file-type";
import fs from "fs/promises";
import logger from "../utils/logger.js";

// Note on scope: this checks that a file's actual bytes match its declared
// type (magic-byte/binary-signature sniffing) - it is NOT malware/virus
// scanning. It stops "this .exe is declared as image/png" but would not
// catch a genuinely malicious, correctly-formed PDF/DOCX (e.g. one embedding
// a known exploit or macro). Real AV scanning needs either a locally
// installed scanner (e.g. ClamAV/clamd) or a third-party scanning API/
// credentials - neither is available in this environment, so this is the
// pragmatic, dependency-free layer that's actually achievable here, on top
// of (not instead of) the extension-from-verified-mimetype fix already in
// mediaMiddleware.js.
//
// file-type can't always report the exact declared mimetype string even for
// a genuine, unmodified file of that type - legacy OLE-based Office formats
// (.doc/.ppt) are only detectable as the generic container format, and
// modern OOXML formats (.docx/.pptx) are technically zip archives, so a
// zip-only detection is accepted as a fallback rather than rejected.
const ACCEPTED_DETECTED_MIME_TYPES = {
  "image/jpeg": ["image/jpeg"],
  "image/png": ["image/png"],
  "image/gif": ["image/gif"],
  "video/mp4": ["video/mp4"],
  "video/avi": ["video/vnd.avi"],
  "video/mkv": ["video/matroska"],
  "application/pdf": ["application/pdf"],
  "application/msword": ["application/x-cfb"],
  "application/vnd.ms-powerpoint": ["application/x-cfb"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
  ],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
  ],
  "audio/mpeg": ["audio/mpeg"],
  "audio/wav": ["audio/wav"],
  // Plain text has no reliable magic-byte signature to sniff - file-type
  // intentionally returns undefined for it, so there's nothing to compare
  // against. The extension-from-mimetype fix already prevents a file
  // declared as text/plain from being stored/served as anything executable.
  "text/plain": null,
};

export const verifyFileContent = async (req, res, next) => {
  if (!req.file) return next();

  const declaredMimeType = req.file.mimetype;
  const accepted = ACCEPTED_DETECTED_MIME_TYPES[declaredMimeType];

  if (accepted === null) return next();

  try {
    const detected = accepted ? await fileTypeFromFile(req.file.path) : undefined;

    if (accepted && !accepted.includes(detected?.mime)) {
      await fs.unlink(req.file.path).catch(() => {});
      logger.warn(
        { declaredMimeType, detectedMimeType: detected?.mime, filename: req.file.originalname },
        "Rejected upload: file content did not match its declared type"
      );
      return res.status(400).json({ message: "That file's content doesn't match its declared type." });
    }

    next();
  } catch (error) {
    await fs.unlink(req.file.path).catch(() => {});
    logger.error({ err: error, filename: req.file.originalname }, "File content verification failed");
    res.status(500).json({ message: "Failed to verify the uploaded file." });
  }
};

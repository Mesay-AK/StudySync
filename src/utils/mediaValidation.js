// Message attachments arrive as a client-supplied { url, type } after the
// client calls POST /messages/upload. Without checking, a client can attach
// ANY url (a tracking pixel or phishing page on another host) and the
// frontend renders it straight into <img src>/<a href>. Only URLs in the exact
// shape our own upload endpoint issues are accepted, and the attachment type
// is re-derived from the server-chosen extension rather than trusted.
const UPLOAD_FILENAME = /^media-\d+-\d+\.(jpg|png|gif|mp4|avi|mkv|pdf|doc|docx|ppt|pptx|txt|mp3|wav)$/;

const typeForExtension = (ext) => {
  if (["jpg", "png", "gif"].includes(ext)) return "image";
  if (["mp4", "avi", "mkv"].includes(ext)) return "video";
  return "file";
};

// Returns { media } (null when no attachment was sent) or { error }.
export const normalizeMedia = (media) => {
  if (media === undefined || media === null) return { media: null };

  const invalid = { error: "Invalid attachment." };
  if (typeof media !== "object" || typeof media.url !== "string") return invalid;

  const prefix = `${process.env.BASE_URL}/uploads/`;
  if (!media.url.startsWith(prefix)) return invalid;

  const filename = media.url.slice(prefix.length);
  const match = UPLOAD_FILENAME.exec(filename);
  if (!match) return invalid;

  return { media: { url: media.url, type: typeForExtension(match[1]) } };
};

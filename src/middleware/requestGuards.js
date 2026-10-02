import fs from "fs/promises";

// Express parses JSON bodies and `a[b]=c` query strings into nested objects,
// so a client can send `{"token": {"$ne": null}}` or `?subject[$ne]=x` and
// have it reach Mongo as a query OPERATOR instead of a value - e.g. matching
// any user's pending password-reset token. No legitimate request to this API
// uses `$`-prefixed keys, and every query parameter it reads is a scalar, so
// both are rejected outright here, before any controller sees them.
const MAX_DEPTH = 20;

const hasOperatorKey = (value, depth = 0) => {
  if (depth > MAX_DEPTH) return true;
  if (Array.isArray(value)) return value.some((v) => hasOperatorKey(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, v]) => key.startsWith("$") || hasOperatorKey(v, depth + 1));
  }
  return false;
};

export const rejectOperatorKeys = (req, res, next) => {
  if (hasOperatorKey(req.body)) {
    return res.status(400).json({ message: "Invalid request." });
  }
  // Repeated (`?q=a&q=b`) or bracketed (`?q[x]=1`) params arrive as arrays/
  // objects, which crash string-only code (escapeRegex) or smuggle operators.
  for (const value of Object.values(req.query || {})) {
    if (typeof value !== "string") {
      return res.status(400).json({ message: "Invalid query parameter." });
    }
  }
  next();
};

// For multipart routes: multer populates req.body after the global guard has
// already run, and its field parser also expands `a[b]` into objects.
export const rejectOperatorKeysInBody = async (req, res, next) => {
  if (hasOperatorKey(req.body)) {
    // multer has already written the upload to disk by this point.
    if (req.file) await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ message: "Invalid request." });
  }
  next();
};

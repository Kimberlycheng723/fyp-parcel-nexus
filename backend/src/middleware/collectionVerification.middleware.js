import multer from "multer";
import { COLLECTION_PHOTO_LIMIT } from "../utils/collectionVerification.js";

export const collectionPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: COLLECTION_PHOTO_LIMIT, files: 1, fields: 0, parts: 2 },
  fileFilter(req, file, callback) {
    callback(["image/jpeg", "image/png"].includes(file.mimetype) ? null : new Error("INVALID_COLLECTION_PHOTO"), true);
  }
}).single("photo");

export function collectionUploadError(error, req, res, next) {
  if (!error) return next();
  if (error.message === "INVALID_COLLECTION_PHOTO" || error instanceof multer.MulterError) {
    return res.status(400).json({ message: "Upload exactly one JPG, JPEG or PNG collection photo, up to 5 MB, using the photo field." });
  }
  return next(error);
}

export function createCollectionVerificationLimiter({ now = Date.now, maximum = 60 } = {}) {
  const windows = new Map();
  return (req, res, next) => {
    const timestamp = now();
    for (const [id, window] of windows) if (timestamp - window.start >= 60000) windows.delete(id);
    const id = req.user.user_id;
    if (!windows.has(id)) {
      if (windows.size >= 2000) return res.status(503).json({ message: "Verification is busy. Please try again shortly." });
      windows.set(id, { start: timestamp, count: 0 });
    }
    const window = windows.get(id);
    if (window.count >= maximum) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((60000 - (timestamp - window.start)) / 1000))));
      return res.status(429).json({ message: "Too many verification requests. Please wait before trying again." });
    }
    window.count++;
    return next();
  };
}

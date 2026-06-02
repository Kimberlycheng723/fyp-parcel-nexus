import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import multer from "multer";

const PARCEL_UPLOAD_DIR = path.resolve("uploads/parcels");
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

fs.mkdirSync(PARCEL_UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, PARCEL_UPLOAD_DIR);
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const safeExtension = extension === ".jpeg" ? ".jpg" : extension;
    callback(null, `${Date.now()}-${crypto.randomUUID()}${safeExtension}`);
  }
});

function imageFileFilter(req, file, callback) {
  if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    return callback(new Error("INVALID_IMAGE_TYPE"));
  }

  return callback(null, true);
}

export const parcelPhotoUpload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: 1
  }
});

export function handleUploadError(error, req, res, next) {
  if (!error) {
    return next();
  }

  if (error.message === "INVALID_IMAGE_TYPE") {
    return res.status(400).json({
      message: "Invalid image type. Please upload a JPG, JPEG, PNG, or WEBP image."
    });
  }

  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      message: "Image is too large. Maximum file size is 5MB."
    });
  }

  return next(error);
}

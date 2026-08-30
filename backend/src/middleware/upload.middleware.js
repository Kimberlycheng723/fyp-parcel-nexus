import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import multer from "multer";

const PARCEL_UPLOAD_DIR = path.resolve("uploads/parcels");
export const DISPUTE_UPLOAD_DIR = path.resolve("uploads/disputes");
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_DISPUTE_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

fs.mkdirSync(PARCEL_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DISPUTE_UPLOAD_DIR, { recursive: true });

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

const disputeEvidenceStorage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, DISPUTE_UPLOAD_DIR);
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const safeExtension = extension === ".jpeg" ? ".jpg" : extension;
    callback(null, `${Date.now()}-${crypto.randomUUID()}${safeExtension}`);
  }
});

function disputeEvidenceFileFilter(req, file, callback) {
  const extension = path.extname(file.originalname || "").toLowerCase();
  const validTypeAndExtension = (
    file.mimetype === "image/jpeg" && [".jpg", ".jpeg"].includes(extension)
  ) || (
    file.mimetype === "image/png" && extension === ".png"
  );

  if (!ALLOWED_DISPUTE_IMAGE_TYPES.has(file.mimetype) || !validTypeAndExtension) {
    return callback(new Error("INVALID_DISPUTE_IMAGE_TYPE"));
  }

  return callback(null, true);
}

export const disputeEvidenceUpload = multer({
  storage: disputeEvidenceStorage,
  fileFilter: disputeEvidenceFileFilter,
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: 3
  }
}).array("evidence", 3);

function hasValidImageSignature(buffer, mimeType) {
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3
      && buffer[0] === 0xff
      && buffer[1] === 0xd8
      && buffer[2] === 0xff;
  }

  if (mimeType === "image/png") {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return buffer.length >= pngSignature.length
      && buffer.subarray(0, pngSignature.length).equals(pngSignature);
  }

  return false;
}

export async function validateDisputeEvidenceContent(req, res, next) {
  const files = Array.isArray(req.files) ? req.files : [];

  try {
    for (const file of files) {
      const handle = await fs.promises.open(file.path, "r");
      const buffer = Buffer.alloc(8);

      try {
        await handle.read(buffer, 0, buffer.length, 0);
      } finally {
        await handle.close();
      }

      if (!hasValidImageSignature(buffer, file.mimetype)) {
        await removeUploadedFiles(files);
        return res.status(400).json({
          message: "Evidence files must contain valid JPG, JPEG, or PNG image data."
        });
      }
    }

    return next();
  } catch (error) {
    await removeUploadedFiles(files);
    return next(error);
  }
}

export async function removeUploadedFiles(files = []) {
  await Promise.all(
    files.map((file) => fs.promises.unlink(file.path).catch(() => undefined))
  );
}

export async function handleUploadError(error, req, res, next) {
  if (!error) {
    return next();
  }

  await removeUploadedFiles(Array.isArray(req.files) ? req.files : []);

  if (error.message === "INVALID_IMAGE_TYPE") {
    return res.status(400).json({
      message: "Invalid image type. Please upload a JPG, JPEG, PNG, or WEBP image."
    });
  }

  if (error.message === "INVALID_DISPUTE_IMAGE_TYPE") {
    return res.status(400).json({
      message: "Invalid evidence type. Please upload JPG, JPEG, or PNG images."
    });
  }

  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      message: "Image is too large. Maximum file size is 5MB."
    });
  }

  if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({
      message: "A dispute can include a maximum of 3 evidence images."
    });
  }

  return next(error);
}

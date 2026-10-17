import crypto from "node:crypto";
import { inflateSync } from "node:zlib";
import PDFDocument from "pdfkit";

export const COLLECTION_PHOTO_LIMIT = 5 * 1024 * 1024;
export const VERIFICATION_MINUTES = 15;
export const MAX_BARCODE_ATTEMPTS = 30;
export const COLLECTION_ERRORS = Object.freeze({
  FORBIDDEN: [403, "You do not have permission to access this collection verification."],
  INVALID_ID: [400, "Session and parcel IDs must be valid UUIDs."],
  SESSION_NOT_FOUND: [404, "Collection verification was not found."],
  SESSION_EXPIRED: [410, "Collection verification has expired. Generate a new QR code."],
  SESSION_INACTIVE: [409, "This verification session is no longer active."],
  PARCEL_NOT_IN_SESSION: [404, "Parcel was not found in this verification session."],
  PARCEL_RESERVED: [409, "A selected parcel is already awaiting verification in another session."],
  PARCEL_CHANGED: [409, "Selected parcel details changed. Cancel this session and generate a new QR."],
  REQUIREMENTS_MISSING: [409, "Every parcel requires a matching barcode and a collection photo."],
  INVALID_BARCODE: [400, "Provide a tracking number of 1-120 printable characters, or unreadable: true."],
  ATTEMPT_LIMIT: [429, "This parcel has reached the 30-scan limit. Cancel and start a new session."],
  PHOTO_REQUIRED: [400, "Upload one collection photo using the photo field."],
  INVALID_PHOTO: [400, "Upload valid JPG, JPEG or PNG image data, up to 5 MB and 16 million pixels."],
  PHOTO_UNAVAILABLE: [409, "A collection photo is unavailable. Replace it before confirming."],
  INVALID_INPUT: [400, "The request contains unsupported fields."]
});

export function validCollectionId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeBarcode(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "INVALID_BARCODE" };
  if (Object.keys(input).length === 1 && input.unreadable === true) return { scanned: null, unreadable: true };
  if (Object.keys(input).length !== 1 || typeof input.scanned_tracking_number !== "string") return { error: "INVALID_BARCODE" };
  const scanned = input.scanned_tracking_number.trim();
  if (!scanned || scanned.length > 120 || /[\x00-\x1f\x7f]/.test(scanned)) return { error: "INVALID_BARCODE" };
  return { scanned, unreadable: false };
}

export function trackingMatches(scanned, registered) {
  return typeof scanned === "string" && scanned.trim().toLowerCase() === registered.trim().toLowerCase();
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function validateCollectionPhoto(file) {
  if (!file?.buffer || !file.buffer.length || file.buffer.length > COLLECTION_PHOTO_LIMIT) return { error: "INVALID_PHOTO" };
  const buffer = file.buffer;
  try {
    const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
      && buffer.at(-2) === 255 && buffer.at(-1) === 217;
    const mime = png ? "image/png" : jpeg ? "image/jpeg" : null;
    if (!mime || file.mimetype !== mime) return { error: "INVALID_PHOTO" };
    if (png) {
      if (buffer.length < 33 || buffer.readUInt32BE(8) !== 13 || buffer.toString("ascii", 12, 16) !== "IHDR") return { error: "INVALID_PHOTO" };
      const imageWidth = buffer.readUInt32BE(16), imageHeight = buffer.readUInt32BE(20);
      if (!imageWidth || !imageHeight || imageWidth * imageHeight > 16000000) return { error: "INVALID_PHOTO" };
      let offset = 8, ended = false, palette = false;
      const compressed = [];
      while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset), end = offset + length + 12;
        if (end > buffer.length) return { error: "INVALID_PHOTO" };
        const type = buffer.toString("ascii", offset + 4, offset + 8);
        if (type === "IHDR" && offset !== 8) return { error: "INVALID_PHOTO" };
        if (type === "PLTE") {
          if (length === 0 || length > 768 || length % 3) return { error: "INVALID_PHOTO" };
          palette = true;
        }
        if (crc32(buffer.subarray(offset + 4, end - 4)) !== buffer.readUInt32BE(end - 4)) return { error: "INVALID_PHOTO" };
        if (type === "IDAT") compressed.push(buffer.subarray(offset + 8, end - 4));
        if (type === "IEND") { ended = end === buffer.length && length === 0; break; }
        offset = end;
      }
      if (!ended || compressed.length === 0) return { error: "INVALID_PHOTO" };
      const depth = buffer[24], color = buffer[25], interlace = buffer[28];
      const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
      if (!channels || (color === 3 && !palette) || ![1, 2, 4, 8, 16].includes(depth) || (color !== 0 && color !== 3 && depth < 8)
        || (color === 3 && depth === 16) || buffer[26] !== 0 || buffer[27] !== 0 || interlace > 1) return { error: "INVALID_PHOTO" };
      const pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: 64 * 1024 * 1024 });
      let position = 0;
      const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
      for (const [x, y, dx, dy] of passes) {
        const width = Math.max(0, Math.ceil((imageWidth - x) / dx));
        const height = Math.max(0, Math.ceil((imageHeight - y) / dy));
        if (!width || !height) continue;
        const rowSize = Math.ceil(width * channels * depth / 8);
        for (let row = 0; row < height; row++) {
          if (position >= pixels.length || pixels[position] > 4) return { error: "INVALID_PHOTO" };
          position += rowSize + 1;
        }
      }
      if (position !== pixels.length) return { error: "INVALID_PHOTO" };
    } else {
      // Reuse PDFKit's JPEG frame parser, after a bounded segment/scan structure check.
      let position = 2, frame = false, scan = false, ended = false;
      while (position < buffer.length) {
        if (buffer[position++] !== 255) return { error: "INVALID_PHOTO" };
        while (buffer[position] === 255) position++;
        const marker = buffer[position++];
        if (marker === 217) { ended = position === buffer.length; break; }
        if (marker === 216 || marker === 0 || (marker >= 208 && marker <= 215)) return { error: "INVALID_PHOTO" };
        const size = buffer.readUInt16BE(position);
        if (size < 2 || position + size > buffer.length) return { error: "INVALID_PHOTO" };
        if ([192, 193, 194].includes(marker)) frame = true;
        position += size;
        if (marker === 218) {
          if (!frame) return { error: "INVALID_PHOTO" };
          scan = true;
          while (position < buffer.length) {
            if (buffer[position] !== 255) { position++; continue; }
            const next = buffer[position + 1];
            if (next === 0 || (next >= 208 && next <= 215)) { position += 2; continue; }
            if (next === 255) { position++; continue; }
            break;
          }
        }
      }
      if (!ended || !frame || !scan) return { error: "INVALID_PHOTO" };
      const parsed = new PDFDocument({ autoFirstPage: false }).openImage(buffer);
      if (!parsed.width || !parsed.height || parsed.width * parsed.height > 16000000) return { error: "INVALID_PHOTO" };
    }
    return { mime, extension: png ? "png" : "jpg", size: buffer.length,
      digest: crypto.createHash("sha256").update(buffer).digest("hex") };
  } catch {
    return { error: "INVALID_PHOTO" };
  }
}

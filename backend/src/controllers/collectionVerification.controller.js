import { COLLECTION_ERRORS } from "../utils/collectionVerification.js";
import { COLLECTION_PHOTO_DIR, cancelCollectionVerification, confirmCollectionVerification,
  getActiveCollectionVerifications, getCollectionPhoto, getCollectionVerification,
  recordCollectionBarcode, saveCollectionPhoto } from "../services/collectionVerification.service.js";
import { emitToUser } from "../realtime/socket.js";

export function sendVerificationResult(res, result) {
  if (result.error) {
    const [status, message] = COLLECTION_ERRORS[result.error] || [409, "Collection is no longer available for verification."];
    return res.status(status).json({ message });
  }
  const { realtime, ...body } = result;
  if (realtime) {
    try { emitToUser(realtime.recipient_user_id, realtime.event, realtime.payload); }
    catch { console.error("Collection real-time delivery failed after commit."); }
  }
  return res.json(body);
}

const args = (req) => ({ requester: req.user, sessionId: req.params.sessionId, parcelId: req.params.parcelId });
export async function activeVerifications(req, res) {
  return sendVerificationResult(res, await getActiveCollectionVerifications({ requester: req.user }));
}
export async function verificationDetails(req, res) {
  return sendVerificationResult(res, await getCollectionVerification(args(req)));
}
export async function verifyBarcode(req, res) {
  return sendVerificationResult(res, await recordCollectionBarcode({ ...args(req), input: req.body }));
}
export async function uploadPhoto(req, res) {
  if (!req.file) return sendVerificationResult(res, { error: "PHOTO_REQUIRED" });
  return sendVerificationResult(res, await saveCollectionPhoto({ ...args(req), file: req.file }));
}
export async function collectionPhoto(req, res, next) {
  const result = await getCollectionPhoto(args(req));
  if (result.error) return sendVerificationResult(res, result);
  res.type(result.file.mime);
  res.set("Cache-Control", "private, no-store");
  res.set("Content-Disposition", "inline");
  res.set("X-Content-Type-Options", "nosniff");
  return res.sendFile(result.file.filename, { root: COLLECTION_PHOTO_DIR }, (error) => {
    if (error && !res.headersSent) {
      if (error.code === "ENOENT" || error.status === 404) res.status(404).json({ message: "Collection photo was not found." });
      else next(error);
    }
  });
}
export async function confirmVerification(req, res) {
  if (req.body && Object.keys(req.body).length) return sendVerificationResult(res, { error: "INVALID_INPUT" });
  return sendVerificationResult(res, await confirmCollectionVerification(args(req)));
}
export async function cancelVerification(req, res) {
  if (req.body && Object.keys(req.body).length) return sendVerificationResult(res, { error: "INVALID_INPUT" });
  return sendVerificationResult(res, await cancelCollectionVerification(args(req)));
}

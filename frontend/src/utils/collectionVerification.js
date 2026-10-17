export const ACTIVE_VERIFICATION = "AWAITING_VERIFICATION";

export function remainingSeconds(expiresAt, now = Date.now()) {
  const deadline = Date.parse(expiresAt || "");
  return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}

export function formatCountdown(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function verificationProgress(session, now = Date.now()) {
  const parcels = session?.parcels || [];
  const verified = parcels.filter((parcel) => parcel.barcode_status === "MATCHED" && parcel.photo_present === true).length;
  return {
    verified, total: parcels.length,
    canConfirm: session?.status === ACTIVE_VERIFICATION && remainingSeconds(session.expires_at, now) > 0 && parcels.length > 0 && verified === parcels.length
  };
}

export function validateCollectionPhoto(file) {
  if (!file) return "Choose a parcel photo first.";
  if (!["image/jpeg", "image/png"].includes(file.type)) return "Use a JPG, JPEG or PNG photo.";
  if (!file.size) return "This photo is empty. Please take another photo.";
  if (file.size > 5 * 1024 * 1024) return "The photo must be 5 MB or smaller.";
  return "";
}

export function validateTrackingNumber(value) {
  const text = value.trim();
  if (!text) return "Enter the tracking number printed on this parcel.";
  if (text.length > 120 || /[\u0000-\u001f\u007f]/.test(text)) return "Enter a valid tracking number (up to 120 characters).";
  return "";
}

export function verificationError(error) {
  if (error?.status === 401) return "Your sign-in has expired. Please sign in again.";
  if (error?.status === 403 || error?.status === 404) return "This verification is unavailable or does not belong to your account.";
  if (error?.status === 410) return "This verification session has expired. Return to My Parcels to start again.";
  if (error?.status === 429) return "Too many attempts. Please wait before trying again.";
  if (error instanceof TypeError) return "Connection interrupted. Your saved progress is safe; please try again.";
  return error?.message || "Unable to update collection verification. Please try again.";
}

export function cameraErrorMessage(error) {
  if (["NotAllowedError", "SecurityError"].includes(error?.name)) return "Camera permission was denied. Allow camera access in your browser settings, or enter the barcode manually.";
  if (["NotFoundError", "DevicesNotFoundError"].includes(error?.name)) return "No camera is available. Enter the tracking number manually instead.";
  if (["NotReadableError", "TrackStartError"].includes(error?.name)) return "The camera is busy. Close other camera apps and try again.";
  return "Unable to start the camera. Please try again or enter the tracking number manually.";
}

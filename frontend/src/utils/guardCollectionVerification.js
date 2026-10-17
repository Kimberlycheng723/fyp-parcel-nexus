import { ACTIVE_VERIFICATION, remainingSeconds, verificationProgress } from "./collectionVerification.js";

const REFERENCE_KEY = "parcel_nexus_guard_verification";
const uuid = (value) => typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const statuses = new Set([ACTIVE_VERIFICATION, "COMPLETED", "EXPIRED", "CANCELLED"]);

export function readGuardVerification(data, guardId) {
  const session = data?.verification_session;
  if (!session || !uuid(session.session_id) || session.guard_id !== guardId || !statuses.has(session.status)
    || !Array.isArray(session.parcels) || !session.parcels.length || !Number.isFinite(Date.parse(session.expires_at))) {
    throw new Error("Unable to read verification status. Please refresh the status or scan the QR again.");
  }
  return session;
}

export function saveGuardVerificationReference(session, guardId) {
  window.sessionStorage.setItem(REFERENCE_KEY, JSON.stringify({ guard_id: guardId, session_id: session.session_id }));
}

export function getGuardVerificationReference(guardId) {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(REFERENCE_KEY));
    if (saved?.guard_id === guardId && uuid(saved.session_id)) return saved.session_id;
  } catch { /* Ignore corrupt local state; the next authorized scan can restore the session. */ }
  return null;
}

export function clearGuardVerificationReference() {
  window.sessionStorage.removeItem(REFERENCE_KEY);
}

export function guardVerificationPresentation(session, now = Date.now()) {
  const progress = verificationProgress(session, now);
  if (session.status === "COMPLETED") return { title: "Collection Completed", label: "Confirmed by Resident", tone: "completed",
    description: "The Resident has successfully verified and confirmed collection of their parcels.", ...progress };
  if (session.status === "EXPIRED") return { title: "Verification Expired", label: "Expired", tone: "closed",
    description: "Verification has expired. Please ask the Resident to restart collection.", ...progress };
  if (session.status === "CANCELLED") return { title: "Verification Cancelled", label: "Cancelled", tone: "closed",
    description: "This verification session has been cancelled.", ...progress };
  const started = session.parcels.some((parcel) => parcel.barcode_status !== "PENDING" || parcel.photo_present || parcel.verified_at);
  return { title: started ? "Verification In Progress" : "Verification Started", tone: "active",
    label: remainingSeconds(session.expires_at, now) === 0 ? "Checking session expiry..."
      : progress.verified === progress.total ? "Awaiting Resident Confirmation" : "Awaiting Resident Verification",
    description: "The Resident can now verify their parcels. Collection will be completed after the Resident confirms.", ...progress };
}

export function guardCollectionError(error, { scanning = false } = {}) {
  if (error?.status === 401) return "Your sign-in has expired. Please sign in again.";
  if (error?.status === 403) return "You do not have access to this verification session. Only its initiating Guard can monitor it.";
  if (error?.status === 404) return scanning ? "This QR code is invalid or unavailable. Please check the Resident's collection QR code." : "This verification session is unavailable or does not belong to your account.";
  if (error?.status === 410) return scanning ? "This QR code has expired. Please ask the Resident to generate a new one." : "Verification has expired. Please ask the Resident to restart collection.";
  if (error?.status === 429) return "Too many requests. Please wait before trying again.";
  if (error?.status === 409 && /already been used/i.test(error.message)) return "This QR code has already been used. Do not hand over the parcels again.";
  if (error?.status === 409 && /cancelled/i.test(error.message)) return "This collection request has been cancelled. Ask the Resident to restart collection.";
  if (error?.status === 409 && /another session/i.test(error.message)) return "A selected parcel is already awaiting verification. Ask the Resident to continue or cancel their existing session.";
  if (error?.status === 409) return "This collection request is no longer available. Ask the Resident to check their collection status.";
  if (error?.status >= 500) return "The collection service is temporarily unavailable. Please try again shortly.";
  if (error instanceof TypeError) return "Connection interrupted. Please try again; collection has not been confirmed by this screen.";
  return "Unable to read verification status. Please try again or scan the QR again.";
}

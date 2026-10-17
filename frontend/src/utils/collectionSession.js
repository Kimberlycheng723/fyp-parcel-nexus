const RESIDENT_COLLECTION_KEY = "parcel_nexus_resident_collection";
const VERIFICATION_KEY = "parcel_nexus_collection_verification";

export function saveResidentCollectionSession(value) {
  window.sessionStorage.removeItem(VERIFICATION_KEY);
  window.sessionStorage.setItem(RESIDENT_COLLECTION_KEY, JSON.stringify(value));
}

export function getResidentCollectionSession() {
  try {
    const storedValue = window.sessionStorage.getItem(RESIDENT_COLLECTION_KEY);
    return storedValue ? JSON.parse(storedValue) : null;
  } catch (error) {
    window.sessionStorage.removeItem(RESIDENT_COLLECTION_KEY);
    return null;
  }
}

export function clearResidentCollectionSession() {
  window.sessionStorage.removeItem(RESIDENT_COLLECTION_KEY);
}

export function saveVerificationReference(session, residentId) {
  // Only identifiers persist here; progress and private photos always come from the server.
  window.sessionStorage.setItem(VERIFICATION_KEY, JSON.stringify({
    session_id: session.session_id, collection_id: session.collection_id, resident_id: residentId
  }));
}

export function getVerificationReference(residentId, collectionId) {
  try {
    const reference = JSON.parse(window.sessionStorage.getItem(VERIFICATION_KEY));
    if (reference?.resident_id === residentId && (!collectionId || reference.collection_id === collectionId)) return reference;
  } catch { /* Ignore an invalid local reference; authorized discovery is the fallback. */ }
  return null;
}

export function clearVerificationReference() {
  window.sessionStorage.removeItem(VERIFICATION_KEY);
}

const RESIDENT_COLLECTION_KEY = "parcel_nexus_resident_collection";

export function saveResidentCollectionSession(value) {
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

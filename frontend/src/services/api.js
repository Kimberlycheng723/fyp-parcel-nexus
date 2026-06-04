import { getAccessToken } from "./tokenStorage.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

function buildHeaders(options = {}, isFormData = false) {
  const headers = {
    ...(options.headers || {})
  };

  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  const token = getAccessToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function apiRequest(path, options = {}) {
  const isFormData = options.body instanceof FormData;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: buildHeaders(options, isFormData),
    body: options.body ? (isFormData ? options.body : JSON.stringify(options.body)) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Request failed. Please try again.");
    error.status = response.status;
    error.errors = data.errors;
    throw error;
  }

  return data;
}

export async function apiDownload(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: buildHeaders(options, true)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.message || "Download failed. Please try again.");
    error.status = response.status;
    throw error;
  }

  return {
    blob: await response.blob(),
    filename: response.headers.get("Content-Disposition") || "",
    contentType: response.headers.get("Content-Type") || ""
  };
}

export function getResidentParcelSummary() {
  return apiRequest("/resident/parcels/summary");
}

export function getResidentParcels({ tab = "pending", search = "", page = 1, limit = 10 } = {}) {
  const params = new URLSearchParams({
    tab,
    page: String(page),
    limit: String(limit)
  });

  if (search) {
    params.set("search", search);
  }

  return apiRequest(`/resident/parcels?${params.toString()}`);
}

export function getResidentParcelDetails(parcelId) {
  return apiRequest(`/resident/parcels/${parcelId}`);
}

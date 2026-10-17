import { getAccessToken } from "./tokenStorage.js";
import { auditQuery } from "../utils/audit.js";
import { readChatbotReply } from "../utils/chatbot.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const SESSION_EXPIRED_EVENT = "parcel-nexus-session-expired";

function notifySessionExpired() {
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

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
    if (response.status === 401 && getAccessToken()) {
      notifySessionExpired();
    }

    const error = new Error(data.message || "Request failed. Please try again.");
    error.status = response.status;
    error.errors = data.errors;
    error.code = data.code;
    error.retryAfter = response.headers.get("Retry-After");
    throw error;
  }

  return data;
}

export async function sendChatbotMessage({ message, history = [] }, options = {}) {
  const data = await apiRequest("/chatbot/message", {
    ...options,
    method: "POST",
    body: { message, history }
  });
  return { reply: readChatbotReply(data) };
}

export async function apiDownload(path, options = {}) {
  return authenticatedDownload(`${API_BASE_URL}${path}`, options);
}

async function authenticatedDownload(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: buildHeaders(options, true)
  });

  if (!response.ok) {
    if (response.status === 401 && getAccessToken()) {
      notifySessionExpired();
    }

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

export function getParcelRegistrationPhoto(photoPath, options = {}) {
  if (!/^\/uploads\/parcels\/\d+-[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(photoPath || '')) {
    return Promise.reject(new Error('Parcel photo unavailable.'));
  }
  const backend = API_BASE_URL.replace(/\/+$/, '').replace(/\/api$/, '');
  return authenticatedDownload(`${backend}${photoPath}`, options);
}

export function getAuditLogs(filters, options = {}) {
  return apiRequest(`/audit-logs?${auditQuery(filters)}`, options);
}

export function exportAuditLogs(filters, options = {}) {
  const { search, date, actions, role } = filters;
  return apiDownload(`/audit-logs/export?${auditQuery({ search, date, actions, role })}`, options);
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

export function getResidentParcelDetails(parcelId, options = {}) {
  return apiRequest(`/resident/parcels/${parcelId}`, options);
}

export function createResidentCollection(parcelIds) {
  return apiRequest("/resident/collections", {
    method: "POST",
    body: { parcel_ids: parcelIds }
  });
}

export function verifyGuardCollection(token) {
  return apiRequest("/guard/collections/verify", {
    method: "POST",
    body: { token }
  });
}

export function sendPasswordResetLink(email) {
  return apiRequest("/auth/forgot-password", {
    method: "POST",
    body: { email }
  });
}

export function requestProfileEmailChange(email) {
  return apiRequest("/profile/email-change/request", {
    method: "POST",
    body: { email }
  });
}

export function confirmProfileEmailChange(token) {
  return apiRequest("/profile/email-change/confirm", {
    method: "POST",
    body: { token }
  });
}

export function getNotifications({ page = 1, limit = 10, unreadOnly = false } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit)
  });

  if (unreadOnly) {
    params.set("unread_only", "true");
  }

  return apiRequest(`/notifications?${params.toString()}`);
}

export function getUnreadNotificationCount() {
  return apiRequest("/notifications/unread-count");
}

export function markNotificationRead(notificationId) {
  return apiRequest(`/notifications/${notificationId}/read`, {
    method: "PATCH"
  });
}

export function markAllNotificationsRead() {
  return apiRequest("/notifications/read-all", {
    method: "PATCH"
  });
}

export function getNotificationPreferences() {
  return apiRequest("/notification-preferences");
}

export function updateNotificationPreferences(preferences) {
  return apiRequest("/notification-preferences", {
    method: "PATCH",
    body: { preferences }
  });
}

export function getBrowserPushPublicKey() {
  return apiRequest("/push-subscriptions/vapid-public-key");
}

export function saveBrowserPushSubscription(subscription) {
  return apiRequest("/push-subscriptions", {
    method: "POST",
    body: { subscription }
  });
}

export function deleteBrowserPushSubscription(endpoint) {
  return apiRequest("/push-subscriptions", {
    method: "DELETE",
    body: { endpoint }
  });
}

export function getEligibleDisputeParcels({ search = "", page = 1, limit = 100 } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit)
  });

  if (search) {
    params.set("search", search);
  }

  return apiRequest(`/disputes/eligible-parcels?${params.toString()}`);
}

export function createResidentDispute({ parcelId, issueType, description, evidence = [] }) {
  const formData = new FormData();
  formData.append("parcel_id", parcelId);
  formData.append("issue_type", issueType);
  formData.append("description", description);
  evidence.forEach((file) => formData.append("evidence", file));

  return apiRequest("/disputes", {
    method: "POST",
    body: formData
  });
}

export function getDisputes({
  status = "",
  issueType = "",
  search = "",
  assignment = "",
  sort = "LATEST_ACTIVITY",
  page = 1,
  limit = 10
} = {}) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit)
  });

  if (status) params.set("status", status);
  if (issueType) params.set("issue_type", issueType);
  if (search) params.set("search", search);
  if (assignment) params.set("assignment", assignment);
  if (sort) params.set("sort", sort);

  return apiRequest(`/disputes?${params.toString()}`);
}

export function getDispute(disputeId) {
  return apiRequest(`/disputes/${disputeId}`);
}

export function getDisputeHistory(disputeId) {
  return apiRequest(`/disputes/${disputeId}/history`);
}

export function getDisputeEvidence(disputeId, evidenceId) {
  return apiDownload(`/disputes/${disputeId}/evidence/${evidenceId}`);
}

export function updateResidentDispute({
  disputeId,
  issueType,
  description,
  keptEvidenceIds,
  evidence = []
}) {
  const formData = new FormData();
  formData.append("issue_type", issueType);
  formData.append("description", description);
  formData.append("kept_evidence_ids", JSON.stringify(keptEvidenceIds));
  evidence.forEach((file) => formData.append("evidence", file));

  return apiRequest(`/disputes/${disputeId}`, {
    method: "PATCH",
    body: formData
  });
}

export function deleteResidentDispute(disputeId) {
  return apiRequest(`/disputes/${disputeId}`, { method: "DELETE" });
}

export function getDisputeMessages(disputeId, { page = 1, limit = 100 } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiRequest(`/disputes/${disputeId}/messages?${params.toString()}`);
}

export function sendDisputeMessage(disputeId, message) {
  return apiRequest(`/disputes/${disputeId}/messages`, {
    method: "POST",
    body: { message }
  });
}

export function transitionDispute(disputeId, status, extra = {}) {
  return apiRequest(`/disputes/${disputeId}/transition`, {
    method: "PATCH",
    body: { status, ...extra }
  });
}

export function updateGuardDisputeResponse(disputeId, guardResponse) {
  return apiRequest(`/disputes/${disputeId}/guard-response`, {
    method: "PATCH",
    body: { guard_response: guardResponse }
  });
}

export function updateAdminDisputeNotes(disputeId, adminResolutionNotes) {
  return apiRequest(`/disputes/${disputeId}/admin-resolution-notes`, {
    method: "PATCH",
    body: { admin_resolution_notes: adminResolutionNotes }
  });
}

export function getParcelRooms(options = {}) {
  return apiRequest("/parcel-rooms", options);
}

export function getActiveParcelRooms(options = {}) {
  return apiRequest("/parcel-rooms/active", options);
}

export function createParcelRoom(input) {
  return apiRequest("/parcel-rooms", { method: "POST", body: input });
}

export function updateParcelRoom(roomId, input) {
  return apiRequest(`/parcel-rooms/${encodeURIComponent(roomId)}`, { method: "PATCH", body: input });
}

export function setParcelRoomStatus(roomId, isActive) {
  return apiRequest(`/parcel-rooms/${encodeURIComponent(roomId)}/status`, { method: "PATCH", body: { is_active: isActive } });
}

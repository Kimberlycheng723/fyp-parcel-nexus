export function auditLabel(value) {
  if (!value) return "Not available";
  if (!String(value).includes("_") && value !== String(value).toUpperCase()) return String(value)[0].toUpperCase() + String(value).slice(1);
  return String(value).toLowerCase().split("_").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}

export function auditQuery({ search = "", date = "", actions = [], role = "", page, limit } = {}) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (date) params.set("date", date);
  [...new Set(actions)].forEach((action) => params.append("action", action));
  if (role) params.set("role", role);
  if (page !== undefined) params.set("page", String(page));
  if (limit !== undefined) params.set("limit", String(limit));
  return params.toString();
}

export function malaysiaAuditDate(value, options = {}) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric", ...options
  }).format(date);
}

export function auditDayKey(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

export function auditDayHeading(value, now = new Date()) {
  const key = auditDayKey(value);
  const today = auditDayKey(now);
  const yesterday = auditDayKey(new Date(now.getTime() - 86400000));
  const prefix = key === today ? "Today - " : key === yesterday ? "Yesterday - " : "";
  return prefix + malaysiaAuditDate(value, { weekday: "short" });
}

export function auditRelativeTime(value, now = Date.now()) {
  const timestamp = new Date(value).getTime();
  if (!value || Number.isNaN(timestamp)) return "";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Display only known business fields, never an unfiltered metadata dump.
const SAFE_FIELDS = new Set([
  "tracking_number", "dispute_reference", "courier", "unit", "issue_type", "status",
  "previous_status", "new_status", "assigned_staff_user_id", "resolved_by_user_id",
  "sender_role", "account_role", "account_status", "collection_deadline",
  "first_name", "last_name", "email", "description_updated", "evidence_count_changed"
]);

function displayValue(value, key) {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (!["string", "number"].includes(typeof value)) return "Not available";
  if (key === "collection_deadline") return malaysiaAuditDate(value, { hour: "2-digit", minute: "2-digit" });
  return String(value);
}

const ROOM_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function recordedRoomName(value) {
  return typeof value === "string" && value.trim() && !ROOM_UUID.test(value.trim()) ? value : "Room name not recorded";
}

function assignmentRoom(metadata, nameKey, idKey) {
  if (typeof metadata[nameKey] === "string" && metadata[nameKey].trim()) return recordedRoomName(metadata[nameKey]);
  if (metadata[idKey] === null || (metadata[nameKey] === null && !metadata[idKey])) return "Not Assigned";
  return "Room name not recorded";
}

export function auditEntityReference(log) {
  if (log.entity_type !== "PARCEL_ROOM") return log.entity_reference || log.entity_id || "Not available";
  const reference = recordedRoomName(log.entity_reference);
  return reference !== "Room name not recorded" ? reference : recordedRoomName(log.metadata?.name);
}

export function auditDescription(log) {
  const description = log.description || "No description available.";
  if (log.entity_type !== "PARCEL_ROOM" && log.action !== "Parcel Room Assignment Changed") return description;
  return description.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[room reference]");
}

export function auditMetadataRows(metadata, { entityType = "" } = {}) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const rows = Object.entries(metadata)
    .filter(([key, value]) => SAFE_FIELDS.has(key) && (value === null || typeof value !== "object"))
    .map(([key, value]) => ({ label: auditLabel(key), value: displayValue(value, key) }));
  if (Object.hasOwn(metadata, "previous_parcel_room_name") || Object.hasOwn(metadata, "previous_parcel_room_id")) {
    rows.push({ label: "Previous Room", value: assignmentRoom(metadata, "previous_parcel_room_name", "previous_parcel_room_id") });
    rows.push({ label: "New Room", value: assignmentRoom(metadata, "parcel_room_name", "parcel_room_id") });
  } else if (Object.hasOwn(metadata, "parcel_room_name") || Object.hasOwn(metadata, "parcel_room_id")) {
    rows.push({ label: "Parcel Room", value: assignmentRoom(metadata, "parcel_room_name", "parcel_room_id") });
  }
  if (entityType === "PARCEL_ROOM") {
    if (Object.hasOwn(metadata, "name")) rows.push({ label: "Room", value: recordedRoomName(metadata.name) });
    if (typeof metadata.is_active === "boolean") rows.push({ label: "Availability", value: metadata.is_active ? "Active" : "Inactive" });
    for (const [key, label] of [["name", "Room name"], ["description", "Description"], ["is_active", "Availability"]]) {
      const change = metadata.changes?.[key];
      if (change && typeof change === "object" && "before" in change && "after" in change) {
        const value = (item) => key === "name" ? recordedRoomName(item) : key === "is_active" && typeof item === "boolean" ? (item ? "Active" : "Inactive") : displayValue(item, key);
        rows.push({ label: `${label} changed`, value: `${value(change.before)} -> ${value(change.after)}` });
      }
    }
  }
  if (metadata.changes && typeof metadata.changes === "object") {
    const roomChange = metadata.changes.parcel_room;
    if (roomChange && typeof roomChange === "object" && "before" in roomChange && "after" in roomChange) {
      const value = (item) => item === null ? "Not Assigned" : recordedRoomName(item);
      rows.push({ label: "Parcel Room changed", value: `${value(roomChange.before)} -> ${value(roomChange.after)}` });
    }
    Object.entries(metadata.changes).filter(([key]) => SAFE_FIELDS.has(key)).forEach(([key, change]) => {
      if (change && typeof change === "object" && "before" in change && "after" in change) {
        rows.push({ label: `${auditLabel(key)} changed`, value: `${displayValue(change.before, key)} -> ${displayValue(change.after, key)}` });
      } else if (typeof change === "boolean") {
        rows.push({ label: auditLabel(key), value: displayValue(change, key) });
      }
    });
  }
  // Staff response content is private; the backend records only the field names.
  if (Array.isArray(metadata.changed_fields)) {
    const names = metadata.changed_fields.filter((key) => SAFE_FIELDS.has(key) || ["guard_response", "admin_resolution_notes"].includes(key));
    if (names.length) rows.push({ label: "Updated fields", value: names.map(auditLabel).join(", ") });
  }
  return rows;
}

export function auditExportFilename(disposition) {
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition.match(/filename="([^"]+)"|filename=([^;]+)/i);
  let filename = plain?.[1] || plain?.[2] || "parcel-nexus-audit-trail.csv";
  if (encoded) {
    try { filename = decodeURIComponent(encoded); } catch { /* Use the plain filename if malformed. */ }
  }
  return filename.trim().split(/[\\/]/).pop().replace(/[\x00-\x1f]/g, "") || "parcel-nexus-audit-trail.csv";
}

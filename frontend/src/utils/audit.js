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

export function auditMetadataRows(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const rows = Object.entries(metadata)
    .filter(([key, value]) => SAFE_FIELDS.has(key) && (value === null || typeof value !== "object"))
    .map(([key, value]) => ({ label: auditLabel(key), value: displayValue(value, key) }));
  if (metadata.changes && typeof metadata.changes === "object") {
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

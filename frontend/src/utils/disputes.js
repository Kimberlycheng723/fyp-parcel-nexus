export const DISPUTE_ISSUE_TYPES = Object.freeze([
  { value: "MISSING_ITEM", label: "Missing Item" },
  { value: "STOLEN", label: "Stolen" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "WRONG_RECIPIENT", label: "Wrong Recipient" }
]);

export const DISPUTE_STATUS_LABELS = Object.freeze({
  OPEN: "Open",
  IN_REVIEW_GUARD: "In Review (Guard)",
  ESCALATED: "Escalated",
  IN_REVIEW_ADMIN: "In Review (Admin)",
  RESOLVED: "Resolved"
});

export function disputeIssueLabel(value) {
  return DISPUTE_ISSUE_TYPES.find((item) => item.value === value)?.label || value || "Unknown";
}

export function disputeStatusLabel(value) {
  return DISPUTE_STATUS_LABELS[value] || value || "Unknown";
}

export function formatMalaysiaDate(value, options = {}) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options
  }).format(date);
}

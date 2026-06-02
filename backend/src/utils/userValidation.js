export const USER_ROLES = ["SUPER_ADMIN", "ADMIN", "GUARD", "RESIDENT"];
export const USER_STATUSES = ["PENDING_ACTIVATION", "ACTIVE", "DEACTIVATED"];

export function normalizeRequiredString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? null : trimmedValue;
}

export function normalizeEmail(value) {
  return normalizeRequiredString(value).toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidUserRole(role) {
  return USER_ROLES.includes(role);
}

export function isValidUserStatus(status) {
  return USER_STATUSES.includes(status);
}

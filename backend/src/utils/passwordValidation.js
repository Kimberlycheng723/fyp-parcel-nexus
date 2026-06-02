export function validatePasswordStrength(password) {
  const errors = [];

  if (typeof password !== "string" || password.length < 8) {
    errors.push("Password must be at least 8 characters long.");
  }

  if (!/[A-Z]/.test(password || "")) {
    errors.push("Password must include at least one uppercase letter.");
  }

  if (!/[a-z]/.test(password || "")) {
    errors.push("Password must include at least one lowercase letter.");
  }

  if (!/[0-9]/.test(password || "")) {
    errors.push("Password must include at least one number.");
  }

  if (!/[^A-Za-z0-9]/.test(password || "")) {
    errors.push("Password must include at least one special character.");
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

import { getPasswordStrength } from "./passwordStrength.js";

export function getEmailFieldError(email, typeMismatch = false) {
  if (!email.trim()) return "The Email field is required.";
  return typeMismatch ? "Enter a valid email address." : "";
}

export function getPasswordFieldErrors(password, confirmation) {
  const errors = {};
  if (!password) errors.password = "The New Password field is required.";
  else if (!getPasswordStrength(password).isValid) errors.password = "Your password must meet all four requirements.";
  if (!confirmation) errors.confirm = "The Confirm Password field is required.";
  else if (password !== confirmation) errors.confirm = "Passwords do not match.";
  return errors;
}

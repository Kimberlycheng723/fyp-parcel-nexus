// Match backend/src/utils/passwordValidation.js exactly; backend validation remains authoritative.
export function getPasswordStrength(value) {
  const password = typeof value === "string" ? value : "";
  const requirements = [
    { id: "length", label: "At least 8 characters long", met: password.length >= 8 },
    { id: "letters", label: "At least one uppercase letter (A-Z) and one lowercase letter (a-z)", met: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { id: "number", label: "At least one number", met: /[0-9]/.test(password) },
    { id: "special", label: "At least one special character (e.g. !, @, #, $)", met: /[^A-Za-z0-9]/.test(password) }
  ];
  const score = requirements.filter((requirement) => requirement.met).length;
  return { requirements, score, isValid: score === requirements.length,
    label: !password ? "Not entered" : score === 4 ? "Strong" : score >= 2 ? "Fair" : "Weak" };
}

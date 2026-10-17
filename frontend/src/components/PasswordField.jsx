import { Eye, EyeOff, Lock } from "lucide-react";
import { useState } from "react";
import { PasswordStrength } from "./PasswordStrength.jsx";
import { AuthFieldError } from "./AuthFieldError.jsx";

export function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder = "Enter your new password",
  autoComplete,
  variant,
  showStrength = false,
  error = "",
  disabled = false
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [strengthDismissed, setStrengthDismissed] = useState(false);

  if (variant === "login") {
    return (
      <div className="pr-field" onFocusCapture={() => setStrengthDismissed(false)}
        onKeyDown={(event) => {if (event.key === "Escape") setStrengthDismissed(true);}}>
        <label htmlFor={id}>{label}</label>
        <div className="pr-password-input">
          <input id={id} type={isVisible ? "text" : "password"} value={value}
            onChange={(event) => {onChange(event.target.value);setStrengthDismissed(false);}} placeholder={placeholder}
            autoComplete={autoComplete} disabled={disabled} required
            aria-invalid={Boolean(error)}
            aria-describedby={[showStrength && `${id}-requirements`, error && `${id}-error`].filter(Boolean).join(" ") || undefined} />
          <button type="button" aria-label={`${isVisible ? "Hide" : "Show"} ${label}`}
            title={`${isVisible ? "Hide" : "Show"} ${label}`} aria-pressed={isVisible}
            onClick={() => setIsVisible((current) => !current)}>
            {isVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        </div>
        <AuthFieldError id={`${id}-error`} message={error} />
        {showStrength && <PasswordStrength id={`${id}-requirements`} value={value}
          expanded={Boolean(value) && !strengthDismissed && !disabled} />}
      </div>
    );
  }

  return (
    <label className="form-field" htmlFor={id}>
      {label && <span>{label}</span>}
      <div className="input-shell">
        <Lock aria-hidden="true" size={18} />
        <input
          id={id}
          type={isVisible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          className="ghost-input-button"
          type="button"
          onClick={() => setIsVisible((current) => !current)}
        >
          {isVisible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
          <span>{isVisible ? "Hide" : "Show"}</span>
        </button>
      </div>
    </label>
  );
}

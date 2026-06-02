import { Eye, EyeOff, Lock } from "lucide-react";
import { useState } from "react";

export function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder = "••••••••••••",
  autoComplete
}) {
  const [isVisible, setIsVisible] = useState(false);

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

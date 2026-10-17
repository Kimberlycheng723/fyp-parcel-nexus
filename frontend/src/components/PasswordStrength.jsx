import { CheckCircle2, CircleX, Info } from "lucide-react";
import { getPasswordStrength } from "../utils/passwordStrength.js";

export function PasswordStrength({ id, value, expanded }) {
  const { requirements, score, label } = getPasswordStrength(value);
  const level = score === 4 ? "strong" : score >= 2 ? "fair" : "weak";
  return (
    <>
      <span className="pr-sr-only" aria-live="polite">{label}. {score} of 4 requirements met.</span>
      <div className="login-strength-reveal" data-expanded={expanded} aria-hidden={!expanded}>
        <div className="login-strength-clip">
          <div id={id} className="login-strength-panel" data-expanded={expanded}>
            <div className="login-strength-label" data-level={level}>
              {score === 4 ? <CheckCircle2 aria-hidden="true" /> : <Info aria-hidden="true" />}{label}
            </div>
            <div className="login-strength-bar" data-level={level} role="meter" aria-label="Password requirements met"
              aria-valuemin={0} aria-valuemax={4} aria-valuenow={score} aria-valuetext={`${score} of 4 requirements met`}>
              {requirements.map((rule, index) => <span key={rule.id} data-filled={index < score} />)}
            </div>
            <ul>
              {requirements.map((rule) => (
                <li key={rule.id} data-met={rule.met}>
                  {rule.met ? <CheckCircle2 aria-hidden="true" /> : <CircleX aria-hidden="true" />}
                  <span>{rule.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

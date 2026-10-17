import { ArrowRight } from "lucide-react";
import { useRef, useState } from "react";

import { Spinner } from "../components/Spinner.jsx";
import { AuthFieldError } from "../components/AuthFieldError.jsx";
import { AuthSuccessDialog } from "../components/AuthSuccessDialog.jsx";
import { useResendCooldown } from "../hooks/useResendCooldown.js";
import { sendPasswordResetLink } from "../services/api.js";
import { navigate } from "../utils/navigation.js";
import { getEmailFieldError } from "../utils/authValidation.js";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [successOpen, setSuccessOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSentEmail, setHasSentEmail] = useState(false);
  const submitting = useRef(false);
  const { secondsRemaining, isCoolingDown, startCooldown } = useResendCooldown(60);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting.current || isCoolingDown) return;
    setError("");
    setMessage("");

    const validation = getEmailFieldError(email, event.currentTarget.querySelector("#forgot-email").validity.typeMismatch);
    setEmailError(validation);
    if (validation) {
      event.currentTarget.querySelector("#forgot-email").focus();
      return;
    }

    submitting.current = true;
    try {
      setIsLoading(true);
      const result = await sendPasswordResetLink(email);
      setHasSentEmail(true);
      setMessage(result.message || "If your account is registered and active, password reset instructions will be sent.");
      setSuccessOpen(true);
      startCooldown();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      submitting.current = false;
      setIsLoading(false);
    }
  }

  return (
    <>
      <h2 id="reset-password-title">Reset your password</h2>
      <p className="pr-intro">Enter your email address and we’ll send you instructions to reset your password.</p>
      <form onSubmit={handleSubmit} noValidate>
        <div className="pr-field">
          <label htmlFor="forgot-email">Email address</label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(event) => {setEmail(event.target.value);setEmailError("");setMessage("");}}
              placeholder="Enter your email address"
              autoComplete="email"
              required
              disabled={isLoading}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? "forgot-email-error" : undefined}
            />
          <AuthFieldError id="forgot-email-error" message={emailError} />
        </div>

        {error && <p className="auth-form-error" role="alert">{error}</p>}
        {message && <p className="auth-form-status" role="status">{message}</p>}

        <button className="pr-primary" type="submit" disabled={isLoading || isCoolingDown}>
          {isLoading ? (
            <Spinner label="Sending..." />
          ) : isCoolingDown ? (
            `Resend email in ${secondsRemaining}s`
          ) : (
            <>{hasSentEmail ? "Resend email" : "Send reset link"} <ArrowRight size={18} /></>
          )}
        </button>

        <p className="login-reset-return">
          Remember your password?{" "}
          <button className="pr-text-button" type="button" onClick={() => navigate("/login")}>
            Sign in
          </button>
        </p>
      </form>
      <AuthSuccessDialog open={successOpen} title="Check your email" message={message}
        onContinue={() => navigate("/login")} onDismiss={() => setSuccessOpen(false)} />
    </>
  );
}

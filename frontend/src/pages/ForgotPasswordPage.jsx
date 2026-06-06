import { ArrowRight, Mail } from "lucide-react";
import { useState } from "react";

import { AuthLayout } from "../components/AuthLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useResendCooldown } from "../hooks/useResendCooldown.js";
import { sendPasswordResetLink } from "../services/api.js";
import { navigate } from "../utils/navigation.js";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasSentEmail, setHasSentEmail] = useState(false);
  const { secondsRemaining, isCoolingDown, startCooldown } = useResendCooldown(60);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    try {
      setIsLoading(true);
      await sendPasswordResetLink(email);
      setHasSentEmail(true);
      setMessage("Password reset link sent. Please check your email.");
      startCooldown();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-heading">
          <h1>Reset your password</h1>
          <p>Enter your email address and we&apos;ll send you a link to reset your password.</p>
        </div>

        <label className="form-field" htmlFor="forgot-email">
          <span>Email</span>
          <div className="input-shell">
            <Mail aria-hidden="true" size={18} />
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email address"
              autoComplete="email"
            />
          </div>
        </label>

        {message && <p className="form-success">{message}</p>}
        {error && <p className="form-error">{error}</p>}

        <button className="primary-button" type="submit" disabled={isLoading || isCoolingDown}>
          {isLoading ? (
            <Spinner label="Sending..." />
          ) : isCoolingDown ? (
            `Resend email in ${secondsRemaining}s`
          ) : (
            <>{hasSentEmail ? "Resend email" : "Send reset link"} <ArrowRight size={18} /></>
          )}
        </button>

        <p className="support-copy">
          Remember your password?{" "}
          <button type="button" onClick={() => navigate("/login")}>
            Sign in
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}

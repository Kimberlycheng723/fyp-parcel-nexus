import { ArrowRight, Mail } from "lucide-react";
import { useState } from "react";

import { AuthLayout } from "../components/AuthLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { apiRequest } from "../services/api.js";
import { navigate } from "../utils/navigation.js";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
      const data = await apiRequest("/auth/forgot-password", {
        method: "POST",
        body: { email }
      });
      setMessage(data.message);
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
              placeholder="you@gemcondo.com"
              autoComplete="email"
            />
          </div>
        </label>

        {message && <p className="form-success">{message}</p>}
        {error && <p className="form-error">{error}</p>}

        <button className="primary-button" type="submit" disabled={isLoading}>
          {isLoading ? <Spinner label="Sending" /> : <>Send reset link <ArrowRight size={18} /></>}
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

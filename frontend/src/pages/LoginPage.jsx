import { Mail, ArrowRight } from "lucide-react";
import { useState } from "react";

import { AuthLayout } from "../components/AuthLayout.jsx";
import { PasswordField } from "../components/PasswordField.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { navigate } from "../utils/navigation.js";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }

    try {
      setIsLoading(true);
      await login({ email, password });
      navigate("/profile");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthLayout>
      <form className="auth-form login-auth-form" onSubmit={handleSubmit}>
        <div className="auth-heading">
          <h1>Welcome to Parcel Nexus!</h1>
          <p>Sign in to access parcel records, notifications and more system features.</p>
        </div>

        <label className="form-field" htmlFor="email">
          <span>Email</span>
          <div className="input-shell">
            <Mail aria-hidden="true" size={18} />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@gemcondo.com"
              autoComplete="email"
            />
          </div>
        </label>

        <div className="password-label-row">
          <span>Password</span>
          <button type="button" onClick={() => navigate("/forgot-password")}>
            Forgot password?
          </button>
        </div>
        <PasswordField
          id="password"
          label=""
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        {error && <p className="form-error">{error}</p>}

        <button className="primary-button" type="submit" disabled={isLoading}>
          {isLoading ? <Spinner label="Signing in" /> : <>Sign in <ArrowRight size={18} /></>}
        </button>

        <p className="support-copy">
          Don&apos;t have an account? <strong>Contact your administrator</strong> at the management office
          or email <strong>admin@gemcondo.com</strong>
        </p>
      </form>
    </AuthLayout>
  );
}

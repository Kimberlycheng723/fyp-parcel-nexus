import { ArrowRight, CheckCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { AuthLayout } from "../components/AuthLayout.jsx";
import { PasswordField } from "../components/PasswordField.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { apiRequest } from "../services/api.js";
import { getQueryParam, navigate } from "../utils/navigation.js";

function validatePasswordForm(password, confirmPassword) {
  if (!password || !confirmPassword) {
    return "Both password fields are required.";
  }

  if (password !== confirmPassword) {
    return "Passwords do not match.";
  }

  return "";
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccessful, setIsSuccessful] = useState(false);
  const { clearSession } = useAuth();
  const token = getQueryParam("token");

  useEffect(() => {
    if (!isSuccessful) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      clearSession();
      navigate("/login");
    }, 1500);

    return () => window.clearTimeout(timerId);
  }, [clearSession, isSuccessful]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("Reset token is missing. Please use the link from your email.");
      return;
    }

    const validationMessage = validatePasswordForm(password, confirmPassword);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    try {
      setIsLoading(true);
      await apiRequest("/auth/reset-password", {
        method: "POST",
        body: { token, newPassword: password }
      });
      setIsSuccessful(true);
    } catch (requestError) {
      setError(requestError.errors?.join(" ") || requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  if (isSuccessful) {
    return (
      <SuccessPanel
        title="Password reset successful!"
        body="Password reset successful. Please log in with your new password."
      />
    );
  }

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-heading">
          <h1>Reset your password</h1>
          <p>Enter a new password for your account.</p>
        </div>

        <PasswordField id="new-password" label="New Password" value={password} onChange={setPassword} />
        <PasswordField
          id="confirm-password"
          label="Confirm Password"
          value={confirmPassword}
          onChange={setConfirmPassword}
        />

        <p className="password-guidance">
          Password must contain at least 8 characters, including uppercase and lowercase letters, a number,
          and a special character.
        </p>

        {error && <p className="form-error">{error}</p>}

        <button className="primary-button" type="submit" disabled={isLoading}>
          {isLoading ? <Spinner label="Resetting" /> : "Reset Password"}
        </button>
      </form>
    </AuthLayout>
  );
}

export function ActivateAccountPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccessful, setIsSuccessful] = useState(false);
  const token = getQueryParam("token");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("Activation token is missing. Please use the link from your email.");
      return;
    }

    const validationMessage = validatePasswordForm(password, confirmPassword);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    try {
      setIsLoading(true);
      await apiRequest("/auth/activate", {
        method: "POST",
        body: { token, newPassword: password }
      });
      setIsSuccessful(true);
    } catch (requestError) {
      setError(requestError.errors?.join(" ") || requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  if (isSuccessful) {
    return (
      <SuccessPanel
        title="Account Activated"
        body="Your account has been activated successfully. You can now sign in to access Parcel Nexus."
        secondaryTitle="Account activated!"
        secondaryBody="Your account is now active. You can sign in to access the parcel management system."
      />
    );
  }

  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-heading">
          <h1>Set your new password</h1>
          <p>For your security, please set a new password before continuing to your account.</p>
        </div>

        <PasswordField id="activation-password" label="New Password" value={password} onChange={setPassword} />
        <PasswordField
          id="activation-confirm-password"
          label="Confirm Password"
          value={confirmPassword}
          onChange={setConfirmPassword}
        />

        <p className="password-guidance">
          Password must contain at least 8 characters, including uppercase and lowercase letters, a number,
          and a special character.
        </p>

        {error && <p className="form-error">{error}</p>}

        <button className="primary-button" type="submit" disabled={isLoading}>
          {isLoading ? <Spinner label="Setting password" /> : "Set Password"}
        </button>
      </form>
    </AuthLayout>
  );
}

function SuccessPanel({ title, body, secondaryTitle, secondaryBody }) {
  return (
    <AuthLayout>
      <section className="success-panel">
        <div className="auth-heading">
          <h1>{title}</h1>
          <p>{body}</p>
        </div>
        <div className="success-mark" aria-hidden="true">
          <CheckCircle size={64} />
        </div>
        <h2>{secondaryTitle || title}</h2>
        <p>{secondaryBody || body}</p>
        <button className="primary-button" type="button" onClick={() => navigate("/login")}>
          Go to Sign in <ArrowRight size={18} />
        </button>
      </section>
    </AuthLayout>
  );
}

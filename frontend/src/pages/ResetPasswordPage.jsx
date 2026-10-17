import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AuthLayout } from "../components/AuthLayout.jsx";
import { PasswordField } from "../components/PasswordField.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { AuthSuccessDialog } from "../components/AuthSuccessDialog.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { apiRequest, confirmProfileEmailChange } from "../services/api.js";
import { getQueryParam, navigate } from "../utils/navigation.js";
import { getPasswordFieldErrors } from "../utils/authValidation.js";

export function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccessful, setIsSuccessful] = useState(false);
  const { clearSession } = useAuth();
  const token = getQueryParam("token");
  const submitting = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting.current || isSuccessful) return;
    setError("");
    const validation = getPasswordFieldErrors(password, confirmPassword);
    setFieldErrors(validation);
    if (Object.keys(validation).length) {
      event.currentTarget.querySelector(validation.password ? "#new-password" : "#confirm-password").focus();
      return;
    }

    if (!token) {
      setError("Reset token is missing. Please use the link from your email.");
      return;
    }

    submitting.current = true;
    try {
      setIsLoading(true);
      await apiRequest("/auth/reset-password", {
        method: "POST",
        body: { token, newPassword: password }
      });
      clearSession();
      setIsSuccessful(true);
      setPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      if (requestError.errors?.length) setFieldErrors({ password: requestError.errors.join(" ") });
      else setError(requestError.message);
    } finally {
      submitting.current = false;
      setIsLoading(false);
    }
  }

  return (
    <AuthLayout titleId="reset-page-title" skipTarget="#new-password">
      <form onSubmit={handleSubmit} noValidate>
        <h2 id="reset-page-title" tabIndex={-1}>Reset your password</h2>
        <p className="pr-intro">Enter a new password for your account.</p>

        <PasswordField variant="login" showStrength autoComplete="new-password" disabled={isLoading || isSuccessful}
          id="new-password" label="New Password" value={password} error={fieldErrors.password}
          onChange={(value) => {setPassword(value);setFieldErrors((previous) => ({...previous, password: ""}));}} />
        <PasswordField
          id="confirm-password"
          label="Confirm Password"
          placeholder="Re-enter your new password"
          value={confirmPassword}
          onChange={(value) => {setConfirmPassword(value);setFieldErrors((previous) => ({...previous, confirm: ""}));}}
          error={fieldErrors.confirm}
          variant="login"
          autoComplete="new-password"
          disabled={isLoading || isSuccessful}
        />

        {error && <p className="auth-form-error" role="alert">{error}</p>}

        <button className="pr-primary" type="submit" disabled={isLoading || isSuccessful}>
          {isLoading ? <Spinner label="Resetting" /> : "Reset Password"}
        </button>
      </form>
      <AuthSuccessDialog open={isSuccessful} title="Password reset successful!"
        message="Your password has been updated. Sign in with your new password."
        onContinue={() => navigate("/login")} />
    </AuthLayout>
  );
}

export function ActivateAccountPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccessful, setIsSuccessful] = useState(false);
  const token = getQueryParam("token");
  const submitting = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting.current || isSuccessful) return;
    setError("");
    const validation = getPasswordFieldErrors(password, confirmPassword);
    setFieldErrors(validation);
    if (Object.keys(validation).length) {
      event.currentTarget.querySelector(validation.password ? "#activation-password" : "#activation-confirm-password").focus();
      return;
    }

    if (!token) {
      setError("Activation token is missing. Please use the link from your email.");
      return;
    }

    submitting.current = true;
    try {
      setIsLoading(true);
      await apiRequest("/auth/activate", {
        method: "POST",
        body: { token, newPassword: password }
      });
      setIsSuccessful(true);
      setPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      if (requestError.errors?.length) setFieldErrors({ password: requestError.errors.join(" ") });
      else setError(requestError.message);
    } finally {
      submitting.current = false;
      setIsLoading(false);
    }
  }

  return (
    <AuthLayout titleId="activate-page-title" skipTarget="#activation-password">
      <form onSubmit={handleSubmit} noValidate>
        <h2 id="activate-page-title" tabIndex={-1}>Set your new password</h2>
        <p className="pr-intro">For your security, please set a new password before continuing to your account.</p>

        <PasswordField variant="login" showStrength autoComplete="new-password" disabled={isLoading || isSuccessful}
          id="activation-password" label="New Password" value={password} error={fieldErrors.password}
          onChange={(value) => {setPassword(value);setFieldErrors((previous) => ({...previous, password: ""}));}} />
        <PasswordField
          id="activation-confirm-password"
          label="Confirm Password"
          placeholder="Re-enter your new password"
          value={confirmPassword}
          onChange={(value) => {setConfirmPassword(value);setFieldErrors((previous) => ({...previous, confirm: ""}));}}
          error={fieldErrors.confirm}
          variant="login"
          autoComplete="new-password"
          disabled={isLoading || isSuccessful}
        />

        {error && <p className="auth-form-error" role="alert">{error}</p>}

        <button className="pr-primary" type="submit" disabled={isLoading || isSuccessful}>
          {isLoading ? <Spinner label="Setting password" /> : "Set Password"}
        </button>
      </form>
      <AuthSuccessDialog open={isSuccessful} title="Account activated!"
        message="Your account is ready. Sign in to access Parcel Nexus."
        onContinue={() => navigate("/login")} />
    </AuthLayout>
  );
}

export function VerifyEmailChangePage() {
  const [status, setStatus] = useState("verifying");
  const [error, setError] = useState("");
  const { clearSession } = useAuth();
  const token = getQueryParam("token");

  useEffect(() => {
    let isMounted = true;

    async function verifyEmailChange() {
      if (!token) {
        setStatus("failed");
        setError("Email verification token is missing. Please use the link from your email.");
        return;
      }

      try {
        await confirmProfileEmailChange(token);

        if (!isMounted) {
          return;
        }

        clearSession();
        setStatus("successful");
      } catch (requestError) {
        if (!isMounted) {
          return;
        }

        setStatus("failed");
        setError(requestError.message);
      }
    }

    verifyEmailChange();

    return () => {
      isMounted = false;
    };
  }, [clearSession, token]);

  return (
    <AuthLayout titleId="verify-email-title">
      <section className="login-account-result" aria-live="polite">
          <h2 id="verify-email-title" tabIndex={-1}>{status === "failed" ? "Email verification failed" : status === "verifying" ? "Verifying email" : "Verify your email"}</h2>
          <p className="pr-intro">
            {status === "verifying"
              ? "Please wait while Parcel Nexus verifies your new email address."
              : "Use the verification link sent to your new email address."}
          </p>
        {status === "failed" && <p className="auth-form-error" role="alert">{error || "Email verification link is invalid or expired."}</p>}
        {status === "verifying" ? <Spinner label="Verifying" /> : null}
        {status === "failed" && (
          <button className="pr-primary" type="button" onClick={() => navigate("/login")}>
            Go to Sign in <ArrowRight size={18} />
          </button>
        )}
      </section>
      <AuthSuccessDialog open={status === "successful"} title="Email verified"
        message="Your email address has been updated. Sign in again with your new email."
        onContinue={() => navigate("/login")} />
    </AuthLayout>
  );
}

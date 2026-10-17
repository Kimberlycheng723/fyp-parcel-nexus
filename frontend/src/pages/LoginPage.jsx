import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthLayout } from "../components/AuthLayout.jsx";
import { AuthFieldError } from "../components/AuthFieldError.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { SESSION_EXPIRED_MESSAGE, useAuth } from "../context/AuthContext.jsx";
import { navigate } from "../utils/navigation.js";
import { landingPathForRole } from "../utils/roleLanding.js";
import { ForgotPasswordPage } from "./ForgotPasswordPage.jsx";
import { getEmailFieldError } from "../utils/authValidation.js";

const SESSION_NOTICE_KEY = "parcel_nexus_session_notice";

export function LoginPage({ resetPassword = false }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    setFieldErrors({});
    setError("");
    if (resetPassword) {setPassword("");setShowPassword(false);}
    const sessionNotice = sessionStorage.getItem(SESSION_NOTICE_KEY);
    if (sessionNotice) {setNotice(SESSION_EXPIRED_MESSAGE);sessionStorage.removeItem(SESSION_NOTICE_KEY);}
  }, [resetPassword]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    const emailError = getEmailFieldError(email, event.currentTarget.querySelector("#email").validity.typeMismatch);
    const passwordError = !password.trim() ? "The Password field is required." : "";
    setFieldErrors({ email: emailError, password: passwordError });
    if (emailError || passwordError) {
      event.currentTarget.querySelector(emailError ? "#email" : "#password").focus();
      return;
    }
    submitting.current = true;
    setIsLoading(true);
    try {
      const loggedInUser = await login({ email, password, remember });
      navigate(landingPathForRole(loggedInUser.role));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      submitting.current = false;
      setIsLoading(false);
    }
  }

  return (
    <AuthLayout titleId={resetPassword ? "reset-password-title" : "sign-in"}
      skipTarget={resetPassword ? "#forgot-email" : "#email"} transitionKey={resetPassword}>
              {resetPassword ? <ForgotPasswordPage /> : <>
              <h2 id="sign-in">Welcome Back !</h2>
              <p className="pr-intro">Sign in to see what&apos;s waiting for you.</p>
              <form onSubmit={handleSubmit} noValidate>
                {notice && <p className="login-notice auth-form-error" role="status">{notice}</p>}
                <div className="pr-field">
                  <label htmlFor="email">Email address</label>
                  <input id="email" type="email" value={email} onChange={(event) => {setEmail(event.target.value);setFieldErrors((previous) => ({...previous, email: ""}));}}
                  placeholder="Enter your email address" autoComplete="username" required disabled={isLoading}
                  aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "email-error" : undefined} />
                  <AuthFieldError id="email-error" message={fieldErrors.email} />
                </div>
                <div className="pr-field">
                  <div className="pr-field-label">
                    <label htmlFor="password">Password</label>
                    <button className="pr-text-button" type="button" onClick={() => navigate("/forgot-password")}>Forgot password?</button>
                  </div>
                  <div className="pr-password-input">
                    <input id="password" type={showPassword ? "text" : "password"} value={password}
                    onChange={(event) => {setPassword(event.target.value);setFieldErrors((previous) => ({...previous, password: ""}));}} placeholder="Enter your password"
                    autoComplete="current-password" required disabled={isLoading}
                    aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "password-error" : undefined} />
                    <button type="button" aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword} onClick={() => setShowPassword((current) => !current)}>
                      {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                    </button>
                  </div>
                  <AuthFieldError id="password-error" message={fieldErrors.password} />
                </div>
                <label className="pr-remember">
                  <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} disabled={isLoading} />
                  <span>Remember me</span>
                </label>
                {error && <p className="auth-form-error" role="alert">{error}</p>}
                <button className="pr-primary" type="submit" disabled={isLoading}>
                  {isLoading ? <Spinner label="Signing in" /> : "Sign in"}
                </button>
              </form>
              </>}
    </AuthLayout>);

}

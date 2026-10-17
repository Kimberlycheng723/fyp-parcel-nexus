export function AuthFieldError({ id, message }) {
  return message ? <p id={id} className="auth-field-error" role="alert">{message}</p> : null;
}

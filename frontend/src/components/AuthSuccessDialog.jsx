import { useEffect, useRef } from "react";
import celebration from "../assets/login/auth-celebration.png";

const ribbons = [
  { x: "-34px", y: "-42px", turn: "-95deg", color: "#3065ff", delay: "70ms" },
  { x: "-12px", y: "-55px", turn: "50deg", color: "#ee3a9c", delay: "100ms" },
  { x: "20px", y: "-52px", turn: "110deg", color: "#3065ff", delay: "80ms" },
  { x: "43px", y: "-35px", turn: "-70deg", color: "#ee3a9c", delay: "130ms" },
  { x: "-42px", y: "-18px", turn: "130deg", color: "#f1ba20", delay: "110ms" },
  { x: "48px", y: "-9px", turn: "85deg", color: "#f1ba20", delay: "90ms" },
  { x: "-23px", y: "-49px", turn: "200deg", color: "#ee3a9c", delay: "160ms" },
  { x: "32px", y: "-22px", turn: "160deg", color: "#3065ff", delay: "140ms" }
];

export function AuthSuccessDialog({ open, title, message, onContinue, continueLabel = "Go to Sign in", onDismiss }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    const form = dialog.closest(".pr-auth-inner");
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (previousFocus?.isConnected && previousFocus !== document.body && !previousFocus.hasAttribute("disabled")) previousFocus.focus();
      else if (form?.isConnected) form.querySelector("input:not(:disabled), button:not(:disabled)")?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <dialog ref={ref} className="auth-success-dialog" aria-labelledby="auth-success-title" aria-describedby="auth-success-description"
      onCancel={(event) => {event.preventDefault();(onDismiss || onContinue)();}}>
      <div className="auth-success-art" aria-hidden="true">
        <img src={celebration} alt="" width="88" height="88" />
        <span className="auth-success-burst">
          {ribbons.map((ribbon, index) => (
            <span key={index} className={index < 4 ? "auth-success-ribbon" : "auth-success-confetti"}
              style={{ "--burst-x": ribbon.x, "--burst-y": ribbon.y, "--burst-turn": ribbon.turn,
                "--burst-color": ribbon.color, "--burst-delay": ribbon.delay }} />
          ))}
        </span>
      </div>
      <h2 id="auth-success-title">{title}</h2>
      <p id="auth-success-description">{message}</p>
      <button className="pr-primary" type="button" onClick={onContinue}>{continueLabel}</button>
      {onDismiss && <button className="auth-success-secondary" type="button" onClick={onDismiss}>Stay on this page</button>}
    </dialog>
  );
}

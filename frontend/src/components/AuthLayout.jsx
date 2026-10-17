import { Headset, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { LoginStory } from "./LoginStory.jsx";

export function AuthLayout({ children, titleId, skipTarget, transitionKey }) {
  const formRef = useRef(null);
  const helpRef = useRef(null);
  const helpTriggerRef = useRef(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const form = formRef.current;
    const animations = [];
    if (!reduce.matches) {
      animations.push(form.animate([{ opacity: .35, transform: "translateX(-17px)" }, { opacity: 1, transform: "translateX(0)" }],
        { duration: 680, easing: "cubic-bezier(.23,1,.32,1)" }));
      [...form.querySelectorAll("h2, .pr-intro, .pr-field, .pr-remember, .pr-primary, .login-help-trigger")].forEach((node, index) => {
        animations.push(node.animate([{ opacity: .2, transform: "translateY(7px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 380, delay: 120 + index * 50, easing: "cubic-bezier(.23,1,.32,1)", fill: "backwards" }));
      });
    }
    const settle = () => animations.forEach((animation) => animation.finish());
    form.addEventListener("focusin", settle);
    document.addEventListener("keydown", settle, { once: true });
    reduce.addEventListener("change", settle);
    return () => {
      animations.forEach((animation) => animation.cancel());
      form.removeEventListener("focusin", settle);
      document.removeEventListener("keydown", settle);
      reduce.removeEventListener("change", settle);
    };
  }, [transitionKey]);

  return (
    <main className="login-redesign">
      <a className="pr-skip" href={skipTarget || `#${titleId}`}>Skip to account form</a>
      <div className="pr-page">
        <div className="pr-main-layout">
          <section className="pr-auth" aria-labelledby={titleId}>
            <div className="pr-auth-inner" ref={formRef}>
              {children}
              <button ref={helpTriggerRef} className="pr-help-link login-help-trigger" type="button" onClick={() => helpRef.current?.showModal()}>
                <Headset aria-hidden="true" /> Need help?
              </button>
            </div>
          </section>
          <LoginStory />
        </div>
      </div>
      <dialog ref={helpRef} className="login-help-dialog" aria-labelledby="login-help-title"
        onClose={() => helpTriggerRef.current?.focus()} onClick={(event) => {
          if (event.target !== helpRef.current) return;
          const bounds = helpRef.current.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) helpRef.current.close();
        }}>
        <button className="pr-dialog-close" type="button" aria-label="Close help" onClick={() => helpRef.current?.close()}><X aria-hidden="true" /></button>
        <h2 id="login-help-title">Having trouble signing in?</h2>
        <p>
          Please contact the condominium management office or email us at{" "}
          <a href="mailto:admin@gemsresidences.com" className="text-blue-600 hover:underline">admin@gemsresidences.com</a>{" "}
          for assistance.
        </p>
      </dialog>
    </main>
  );
}

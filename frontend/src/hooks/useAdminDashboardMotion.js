import { useEffect, useRef } from "react";

// Timings and easing follow the supplied dashboard, with visible final states.
export function useAdminDashboardMotion(kind, signature) {
  const ref = useRef(null), revealed = useRef(false);
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const animations = [];
    let active = true;
    const stop = () => { animations.forEach((animation) => animation.cancel()); root.dataset.motion = "idle"; };
    function reveal() {
      if (reduced.matches || document.hidden) return;
      const initial = !revealed.current;
      revealed.current = true;
      const duration = initial ? 1450 : 900;
      const animate = (node, frames, options = {}) => {
        if (node) animations.push(node.animate(frames, { duration, easing: "cubic-bezier(.23,1,.32,1)", ...options }));
      };
      if (kind === "status") {
        root.querySelectorAll(".adm-status-arc").forEach((arc, index) => {
          const delay = initial ? index * 70 : 0;
          animate(arc, [{ strokeDasharray: "0 100", opacity: .3 }, { strokeDasharray: `${arc.dataset.length} 100`, opacity: 1 }], { delay, duration: duration - delay, fill: "backwards" });
        });
        if (initial) {
          animate(root.querySelector(".adm-donut-centre"), [{ opacity: .25 }, { opacity: 1 }], { duration: 350, delay: 220, fill: "backwards" });
          root.querySelectorAll(".adm-status-key button").forEach((node, index) => animate(node, [{ opacity: .4, transform: "translateY(3px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 350, delay: 430 + index * 80, fill: "backwards" }));
        }
      } else if (kind === "activity") {
        animate(root.querySelector(".adm-trend-lines"), [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }]);
        animate(root.querySelector(".adm-trend-fill"), [{ opacity: .08 }, { opacity: 1 }], { duration: initial ? 650 : 500, delay: initial ? 350 : 120, fill: "backwards" });
      } else if (kind === "rooms") {
        root.querySelectorAll(".adm-room-cell").forEach((node, index) => animate(node, [{ opacity: .3 }, { opacity: 1 }], { duration: 700, delay: index * 25, fill: "backwards" }));
      } else if (kind === "disputes") {
        root.querySelectorAll(".adm-dispute-bars button > i > b").forEach((node, index) => animate(node, [{ transform: "scaleX(.08)" }, { transform: "scaleX(1)" }], { delay: initial ? index * 70 : 0, fill: "backwards" }));
      } else if (kind === "room-stacks" && initial) {
        root.querySelectorAll('.ops-stack').forEach((node, index) => animate(node,
          [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
          { duration: 600, delay: Math.min(index * 60, 180), fill: 'backwards' }));
      }
      root.dataset.motion = animations.length ? "running" : "idle";
      Promise.allSettled(animations.map((animation) => animation.finished)).then(() => { if (active) root.dataset.motion = "idle"; });
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); reveal(); }
    });
    observer.observe(root);
    const cancelOnPreference = () => { if (reduced.matches) stop(); };
    reduced.addEventListener("change", cancelOnPreference);
    return () => { active = false; observer.disconnect(); reduced.removeEventListener("change", cancelOnPreference); stop(); };
  }, [kind, signature]);
  return ref;
}

export function useMetricSpotlight() {
  const ref = useRef(null);
  useEffect(() => {
    const card = ref.current;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)"), pointer = matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0, last = 0, state;
    function tick(now) {
      frame = 0;
      const follow = 1 - Math.exp(-Math.min(50, Math.max(1, now - last)) / 55);
      last = now;
      state.x += (state.tx - state.x) * follow; state.y += (state.ty - state.y) * follow;
      const moving = Math.abs(state.tx - state.x) + Math.abs(state.ty - state.y) > .2;
      if (!moving) { state.x = state.tx; state.y = state.ty; }
      card.style.setProperty("--spotlight-x", `${state.x.toFixed(1)}px`);
      card.style.setProperty("--spotlight-y", `${state.y.toFixed(1)}px`);
      if (moving) frame = requestAnimationFrame(tick);
    }
    function move(event) {
      if (event.pointerType !== "mouse" || !pointer.matches || reduced.matches || document.hidden) return;
      const rect = card.getBoundingClientRect(), tx = Math.max(0, Math.min(rect.width, event.clientX - rect.left)), ty = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
      if (!state) {
        state = { x: rect.width * .18, y: rect.height * .2, tx, ty };
        card.style.setProperty('--spotlight-x', `${state.x.toFixed(1)}px`);
        card.style.setProperty('--spotlight-y', `${state.y.toFixed(1)}px`);
      }
      else { state.tx = tx; state.ty = ty; }
      if (!frame) { last = performance.now(); frame = requestAnimationFrame(tick); }
    }
    function reset() { cancelAnimationFrame(frame); frame = 0; state = null; card.style.removeProperty("--spotlight-x"); card.style.removeProperty("--spotlight-y"); }
    const focus = () => { if (card.matches(':focus-visible')) reset(); };
    const visibility = () => { if (document.hidden) reset(); };
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerleave", reset);
    card.addEventListener("pointercancel", reset);
    card.addEventListener('focusin', focus);
    reduced.addEventListener("change", reset); pointer.addEventListener("change", reset);
    document.addEventListener("keydown", reset, true); document.addEventListener("visibilitychange", visibility);
    return () => { reset(); card.removeEventListener("pointermove", move); card.removeEventListener("pointerleave", reset); card.removeEventListener("pointercancel", reset); card.removeEventListener('focusin', focus); reduced.removeEventListener("change", reset); pointer.removeEventListener("change", reset); document.removeEventListener("keydown", reset, true); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  return ref;
}

import { useLayoutEffect } from 'react';

// Page components remount the shell; retain the visible position for the next route.
let lastSelection = null;

export function useSidebarIndicator(navRef, { path, role, collapsed, open }) {
  useLayoutEffect(() => {
    const nav = navRef.current;
    const indicator = nav?.querySelector('.liquid-nav-indicator');
    if (!indicator) return undefined;
    let disposed = false;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    function position(initial = false) {
      if (disposed) return;
      const active = nav.querySelector('[aria-current="page"]');
      if (!active) { indicator.hidden = true; return; }
      const target = { top: active.offsetTop, height: active.offsetHeight };
      if (initial) {
        const previous = lastSelection?.role === role
          && performance.now() - lastSelection.at < 1500 && !reduced.matches ? lastSelection : target;
        indicator.style.transition = 'none';
        indicator.style.transform = `translateY(${previous.top}px)`;
        indicator.style.height = previous.height + 'px';
        indicator.hidden = false;
        indicator.getBoundingClientRect();
        indicator.style.removeProperty('transition');
      }
      indicator.style.transform = `translateY(${target.top}px)`;
      indicator.style.height = target.height + 'px';
      lastSelection = { ...target, role, path, at: performance.now() };
    }
    position(true);
    const observer = new ResizeObserver(() => position());
    observer.observe(nav);
    nav.querySelectorAll('.nav-item').forEach(node => observer.observe(node));
    const resize = () => position();
    window.addEventListener('resize', resize);
    document.fonts.ready.then(resize);
    return () => {
      if (!indicator.hidden) {
        const style = getComputedStyle(indicator);
        lastSelection = { role, path, top: new DOMMatrixReadOnly(style.transform).m42,
          height: parseFloat(style.height), at: performance.now() };
      }
      disposed = true;
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [navRef, path, role, collapsed, open]);
}

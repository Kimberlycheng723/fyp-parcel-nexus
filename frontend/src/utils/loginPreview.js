// Timing, choreography, and illustrative QR pattern adapted from the supplied ZIP.
export function startLoginPreview(root, world) {
  const el = (selector) => root.querySelector(selector);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stage = el(".pr-demo-stage");
  const screens = [...root.querySelectorAll("[data-screen]")];
  const duration = (index) => [3200, 2800, 2800, 3400][index + 1];
  const activity = [
  ["A delivery, neatly recorded.", "Unit A-12-08 · Shelf B-04"],
  ["A little update. A lot less guessing.", "Ready for collection at your lobby"],
  ["Both parcels, safely collected.", "Confirmed by the Resident"]];

  let chapter = -1,animations = [],timer,remaining = duration(-1),started = 0;
  let playing = !reduce.matches,visible = !document.hidden,inView = true,waitingToReplay = false;
  const active = () => playing && visible && inView;
  // Illustrative, deliberately non-functional QR pattern: no encoded user data.
  const qr = el('#sample-qr');
  qr.replaceChildren();
  const ns = 'http://www.w3.org/2000/svg';
  const rect = (x, y, w, h) => {const r = document.createElementNS(ns, 'rect');r.setAttribute('x', x);r.setAttribute('y', y);r.setAttribute('width', w);r.setAttribute('height', h);qr.append(r);};
  const finder = (x, y) => {rect(x, y, 7, 7);const r = document.createElementNS(ns, 'rect');r.setAttribute('x', x + 1);r.setAttribute('y', y + 1);r.setAttribute('width', 5);r.setAttribute('height', 5);r.setAttribute('fill', '#f6f8fd');qr.append(r);rect(x + 2, y + 2, 3, 3);};
  finder(1, 1);finder(21, 1);finder(1, 21);
  for (let y = 1; y < 28; y++) for (let x = 1; x < 28; x++) {if (x < 9 && y < 9 || x > 19 && y < 9 || x < 9 && y > 19) continue;if ((x * 19 + y * 13 + x * y * 3) % 11 < 5) rect(x, y, 1, 1);}


  function animate(selector, frames, opts = {}) {
    const node = typeof selector === "string" ? el(selector) : selector;
    const timing = { duration: 600, easing: "cubic-bezier(.22,1,.36,1)", fill: "both", ...opts };
    if (!opts.exact) {timing.duration *= .48;if (timing.delay) timing.delay *= .48;}
    delete timing.exact;
    const animation = node.animate(frames, timing);
    animations.push(animation);
    if (!active()) animation.pause();
    return animation;
  }
  function resetTimer() {clearTimeout(timer);timer = null;}
  function schedule() {
    if (!active() || timer) return;
    started = performance.now();
    timer = setTimeout(() => {
      timer = null;
      if (chapter < 2) show(chapter + 1, true);
      else if (waitingToReplay) show(-1, true);
      else {waitingToReplay = true;remaining = 2000;schedule();}
    }, remaining);
  }
  function suspend() {
    if (timer) {remaining = Math.max(0, remaining - (performance.now() - started));resetTimer();}
    animations.forEach((animation) => {if (animation.playState === "running") animation.pause();});
    world.pause();
  }
  function resume() {
    animations.forEach((animation) => {if (animation.playState === "paused") animation.play();});
    if (chapter === -1 && !reduce.matches) world.play();
    schedule();
  }
  function sync() {active() ? resume() : suspend();}
  function show(index, auto = false, instant = false) {
    resetTimer();animations.forEach((a) => a.cancel());animations = [];world.pause();chapter = index;remaining = duration(index);waitingToReplay = false;
    stage.dataset.scene = index;
    screens.forEach((s, i) => s.hidden = i !== index);
    const still = reduce.matches || instant;
    if (index === -1) {
      world.reset(still);
      el('.pr-world-status strong').textContent = still ? 'Your delivery, connected.' : 'A delivery is on its way.';
      el('.pr-world-notification').style.opacity = still ? '1' : '0';
      if (!still) {
        animate('.pr-delivery-world', [{ opacity: .8, transform: 'translateY(13px) scale(.97)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 650, exact: true });
        animate('.pr-tower-label', [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { delay: 180, duration: 420, exact: true });
        animate('.pr-lobby-label', [{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }], { delay: 470, duration: 400, exact: true });
        animate('.pr-world-status', [{ opacity: 0, transform: 'translateX(-15px)' }, { opacity: 1, transform: 'translateX(0)' }], { delay: 650, duration: 400, exact: true });
        animate('.pr-world-notification', [{ opacity: 0, transform: 'translateY(12px) scale(.96)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { delay: 1900, duration: 420, exact: true });
        if (active()) world.play();
      }
      schedule();return;
    }
    el('#activity-title').textContent = activity[index][0];el('#activity-detail').textContent = activity[index][1];
    el('.pr-demo-pointer span').textContent = index === 0 ? 'Security team' : 'Maya';
    el('.pr-notification-float').style.opacity = '0';el('.pr-qr-float').style.opacity = '0';el('.pr-activity-float').style.opacity = '0';el('.pr-registered-state').style.opacity = '0';el('.pr-qr-verification').style.opacity = '0';el('.pr-scan-line').style.opacity = '0';el('.pr-demo-pointer').style.opacity = '0';
    root.querySelectorAll('.pr-collection-row').forEach((r) => r.classList.remove('pr-selected'));
    if (still) {
      el('.pr-activity-float').style.opacity = '1';
      if (index === 1) el('.pr-notification-float').style.opacity = '1';
      if (index === 2) {el('.pr-qr-float').style.opacity = '1';el('.pr-qr-verification').style.opacity = '1';root.querySelectorAll(".pr-collection-row").forEach((r) => r.classList.add('pr-selected'));}
    } else {
      animate('.pr-system-stage', [{ opacity: 0, transform: 'scale(.87) translateY(18px) rotateY(-12deg)' }, { opacity: 1, transform: 'scale(1) translateY(0) rotateY(0)' }], { duration: index === 0 ? 600 : 350, exact: true });
      if (index === 0) animate('.pr-delivery-world', [{ opacity: .9, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.92) translateY(-12px)' }], { duration: 350, exact: true });
      const small = matchMedia('(max-width:480px)').matches;
      animate('.pr-workspace', [{ transform: small ? 'translateY(12px) rotateZ(-3deg)' : 'translateY(20px) rotateY(-11deg) rotateX(5deg) rotateZ(-3deg)', opacity: .65 }, { transform: small ? 'translateY(0) rotateZ(-1.5deg)' : 'translateY(0) rotateY(-5deg) rotateX(3deg) rotateZ(-2deg)', opacity: 1 }], { duration: 950 });
      animate(screens[index], [{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 420 });
      if (index === 0) {
        animate('.pr-delivery-form .pr-full strong', [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { delay: 300, duration: 540, exact: true });
        root.querySelectorAll('.pr-delivery-form .pr-mini-input').forEach((field, i) => animate(field, [{ opacity: .45, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { delay: 120 + i * 45, duration: 240, exact: true }));
        animate('.pr-demo-pointer', [{ opacity: 0, transform: 'translate(-55px,-56px)' }, { opacity: 1, transform: 'translate(-22px,-20px)', offset: .4 }, { opacity: 1, transform: 'translate(0,0)', offset: .8 }, { opacity: 0, transform: 'translate(0,0)' }], { delay: 1100, duration: 2100 });
        animate('.pr-preview-submit', [{ transform: 'scale(1)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }], { delay: 2600, duration: 250 });
        animate('.pr-registered-state', [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { delay: 3050, duration: 360 });
        animate('.pr-activity-float', [{ opacity: 0, transform: 'translateY(16px) rotate(1deg)' }, { opacity: 1, transform: 'translateY(0) rotate(1deg)' }], { delay: 3200, duration: 650 });
      } else if (index === 1) {
        animate('.pr-notification-float', [{ opacity: 0, transform: 'translateY(-18px) rotate(3deg) scale(.97)' }, { opacity: 1, transform: 'translateY(0) rotate(3deg) scale(1)' }], { delay: 650, duration: 800 });
        animate('.pr-parcel-summary', [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'translateX(0)' }], { delay: 250, duration: 500 });
        animate('.pr-activity-float', [{ opacity: 0, transform: 'translateY(16px) rotate(1deg)' }, { opacity: 1, transform: 'translateY(0) rotate(1deg)' }], { delay: 1900, duration: 650 });
      } else {
        const rows = [...root.querySelectorAll('.pr-collection-row')];
        rows.forEach((r, i) => {
          animate(r.querySelector('.pr-mini-checkbox'), [{ background: '#fff', borderColor: '#ced8ef' }, { background: '#2547ce', borderColor: '#2547ce' }], { delay: 600 + i * 500, duration: 160 });
          animate(r.querySelector('.pr-mini-checkbox svg'), [{ opacity: 0 }, { opacity: 1 }], { delay: 600 + i * 500, duration: 160 });
        });
        animate('.pr-demo-pointer', [{ opacity: 0, transform: 'translate(-110px,-113px)' }, { opacity: 1, transform: 'translate(-110px,-113px)', offset: .15 }, { opacity: 1, transform: 'translate(-110px,-65px)', offset: .4 }, { opacity: 1, transform: 'translate(0,-15px)', offset: .8 }, { opacity: 0, transform: 'translate(0,-15px)' }], { delay: 350, duration: 2100 });
        animate('.pr-qr-float', [{ opacity: 0, transform: 'translate(23px,15px) rotate(7deg) scale(.97)' }, { opacity: 1, transform: 'translate(0,0) rotate(4deg) scale(1)' }], { delay: 1800, duration: 850 });
        animate('.pr-scan-line', [{ opacity: 0, transform: 'translateY(0)' }, { opacity: 1, transform: 'translateY(0)', offset: .1 }, { opacity: 1, transform: 'translateY(83px)', offset: .85 }, { opacity: 0, transform: 'translateY(83px)' }], { delay: 2900, duration: 1200, easing: 'linear' });
        animate('.pr-qr-verification', [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], { delay: 4200, duration: 350 });
        animate('.pr-activity-float', [{ opacity: 0, transform: 'translateY(16px) rotate(1deg)' }, { opacity: 1, transform: 'translateY(0) rotate(1deg)' }], { delay: 4450, duration: 650 });
      }
    }
    schedule();
  }

  const onVisibility = () => {visible = !document.hidden;sync();};
  const onReducedMotion = () => {playing = !reduce.matches;show(chapter, false, reduce.matches);};
  document.addEventListener("visibilitychange", onVisibility);
  reduce.addEventListener("change", onReducedMotion);
  const observer = new IntersectionObserver((entries) => {
    const next = entries[0].isIntersecting;
    if (next !== inView) {inView = next;sync();}
  }, { threshold: .15 });
  observer.observe(el("#product-demo"));
  show(-1, true, reduce.matches);
  return () => {
    resetTimer();
    animations.forEach((animation) => animation.cancel());
    observer.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    reduce.removeEventListener("change", onReducedMotion);
    world.pause();
  };
}


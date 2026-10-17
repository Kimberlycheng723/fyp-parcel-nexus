import { memo, useEffect, useRef } from "react";
import { ArrowRight, Bell, Box, Building2, Check, Clock3, LayoutGrid, LockKeyhole, QrCode } from "lucide-react";
import { startLoginPreview } from "../utils/loginPreview.js";

// The supplied animation is decorative, isolated from authentication and real parcel data.
export const LoginStory = memo(function LoginStory() {
  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current;
    let world,stop,cancelled = false;
    // Load the 3D renderer only on login, not in the authenticated dashboard bundle.
    import("../utils/loginWorld.js").then(({ createDeliveryWorld }) => {
      if (cancelled) return;
      world = createDeliveryWorld(root.querySelector("#delivery-canvas"), root.querySelector(".pr-world-fallback"));
      stop = startLoginPreview(root, world);
    }).catch(() => {
      if (cancelled) return;
      root.querySelector("#delivery-canvas").hidden = true;
      root.querySelector(".pr-world-fallback").style.display = "flex";
    });
    return () => {cancelled = true;stop?.();world?.dispose();};
  }, []);
  return (
    <div ref={rootRef} className="login-story-root" aria-hidden="true">
      <section className="pr-story" aria-labelledby="story-title">
        <div className="pr-story-copy"><h1 id="story-title">Smarter parcels,<br />Simpler living.</h1><p>Track deliveries, stay informed, and collect parcels with ease.<br /> Everything you need, all in one place.</p></div>
        <div className="pr-product-demo" id="product-demo" aria-label="Animated sample of the parcel management system">
          <div className="pr-demo-stage" data-scene="-1">
            <div className="pr-delivery-world" aria-hidden="true">
              <canvas id="delivery-canvas"></canvas>
              <div className="pr-world-fallback"><Building2 aria-hidden="true" /><span className="pr-fallback-route"></span><Box aria-hidden="true" /><span className="pr-fallback-route"></span><Bell aria-hidden="true" /></div>
              <div className="pr-world-label pr-tower-label"><span className="pr-world-dot"></span>GEM Condominiums</div>
              <div className="pr-world-label pr-lobby-label"><Box aria-hidden="true" />Lobby parcel room</div>
              <div className="pr-world-status"><span><Check aria-hidden="true" /></span><div><strong>A delivery is on its way.</strong><small>Courier → lobby → you</small></div></div>
              <div className="pr-world-notification"><span className="pr-little-brand"><Bell aria-hidden="true" />Arrival update</span><strong>Your parcel is here.</strong><small>Ready at the lobby parcel room</small></div>
            </div>
            <div className="pr-system-stage">
            <div className="pr-back-sheet" aria-hidden="true"></div>
            <div className="pr-workspace" aria-hidden="true">
              <aside className="pr-mini-sidebar"><span className="pr-mini-brand"><Box aria-hidden="true" /></span><span><LayoutGrid aria-hidden="true" /></span><span className="pr-active"><Box aria-hidden="true" /></span><span><QrCode aria-hidden="true" /></span><span><Bell aria-hidden="true" /></span><span className="pr-mini-avatar">ML</span></aside>
              <div className="pr-workspace-main">
                <div className="pr-workspace-top"><span><Building2 aria-hidden="true" /><span className="sample-building">GEM Condominiums</span></span><span className="pr-sample-tag">Preview</span></div>
                <div className="pr-screen" data-screen="0">
                  <div className="pr-screen-title"><div><small>Security workspace</small><h3>Register a delivery</h3></div><span className="pr-tiny-avatar">AK</span></div>
                  <div className="pr-delivery-form"><div className="pr-mini-input"><small>Resident / unit</small><strong>Maya Lee <span>A-12-08</span></strong></div><div className="pr-mini-input"><small>Courier</small><strong><i className="pr-courier-mark"></i>J&T Express</strong></div><div className="pr-mini-input pr-full"><small>Tracking number</small><strong>JT 0824 6193 MY</strong><Check className="pr-input-check" aria-hidden="true" /></div><div className="pr-mini-input"><small>Parcel type</small><strong>Small package</strong></div><div className="pr-mini-input"><small>Storage location</small><strong>Shelf B · 04</strong></div></div>
                  <div className="pr-mini-action"><span><Bell aria-hidden="true" />Notify resident automatically</span><span className="pr-preview-submit">Register parcel <ArrowRight aria-hidden="true" /></span></div>
                  <div className="pr-registered-state"><span><Check aria-hidden="true" /></span><strong>Parcel registered</strong><small>Resident notification is on its way.</small></div>
                </div>
                <div className="pr-screen" data-screen="1" hidden>
                  <div className="pr-screen-title"><div><small>Resident workspace</small><h3>Good evening, Maya.</h3></div><span className="pr-tiny-avatar">ML</span></div>
                  <div className="pr-parcel-summary"><Box aria-hidden="true" /><div><strong>2 parcels are waiting for you</strong><small>Ready at the lobby parcel room</small></div><span className="pr-pill">Ready</span></div>
                  <div className="pr-list-head"><strong>My parcels</strong><span>Arrived today</span></div>
                  <div className="pr-parcel-row"><span className="pr-package-thumb pr-kraft"><Box aria-hidden="true" /></span><div><strong>J&T Express</strong><small>JT 0824 6193 MY</small></div><span className="pr-row-status">Ready to collect</span></div>
                  <div className="pr-parcel-row"><span className="pr-package-thumb pr-mist"><Box aria-hidden="true" /></span><div><strong>DHL eCommerce</strong><small>DH 0941 2086 MY</small></div><span className="pr-row-status">Ready to collect</span></div>
                  <div className="pr-mini-bottom"><Clock3 aria-hidden="true" />Updated just now <span>View parcel details <ArrowRight aria-hidden="true" /></span></div>
                </div>
                <div className="pr-screen" data-screen="2" hidden>
                  <div className="pr-screen-title"><div><small>Resident workspace</small><h3>Verify, then collect.</h3></div><span className="pr-tiny-avatar">ML</span></div>
                  <div className="pr-collection-help">Select the parcels you’re collecting today.</div>
                  <div className="pr-parcel-row pr-collection-row"><span className="pr-mini-checkbox"><Check aria-hidden="true" /></span><span className="pr-package-thumb pr-kraft"><Box aria-hidden="true" /></span><div><strong>J&T Express</strong><small>Shelf B · 04</small></div><span className="pr-row-status">Ready</span></div>
                  <div className="pr-parcel-row pr-collection-row"><span className="pr-mini-checkbox"><Check aria-hidden="true" /></span><span className="pr-package-thumb pr-mist"><Box aria-hidden="true" /></span><div><strong>DHL eCommerce</strong><small>Shelf B · 06</small></div><span className="pr-row-status">Ready</span></div>
                  <div className="pr-collection-bar"><span><strong>2 parcels selected</strong><small>One code. One quick collection.</small></span><span className="pr-preview-submit">Generate QR <QrCode aria-hidden="true" /></span></div>
                  <div className="pr-mini-bottom"><LockKeyhole aria-hidden="true" />Only your building team can verify this code.</div>
                </div>
              </div>
              <div className="pr-demo-pointer"><svg viewBox="0 0 28 32"><path d="M4 2v24l6-6 5 10 5-2-5-10h10Z" /></svg><span>Security team</span></div>
            </div>
            <div className="pr-activity-float" aria-hidden="true"><span className="pr-activity-icon"><Box aria-hidden="true" /></span><div><strong id="activity-title">A delivery, neatly recorded.</strong><small id="activity-detail">Unit A-12-08 · Shelf B-04</small></div><span className="pr-activity-tick"><Check aria-hidden="true" /></span></div>
            <div className="pr-notification-float" aria-hidden="true"><div className="pr-notification-top"><span className="pr-little-brand"><Box aria-hidden="true" />Parcel Nexus</span><small>Just now</small></div><strong>Your parcel has arrived</strong><p>Hi Maya, your J&T parcel is ready<br />for collection at the lobby.</p><span>View my parcels <ArrowRight aria-hidden="true" /></span></div>
            <div className="pr-qr-float" aria-hidden="true"><div className="pr-qr-header"><span className="pr-little-brand"><QrCode aria-hidden="true" />Collection pass</span><LockKeyhole aria-hidden="true" /></div><div className="pr-qr-pattern"><svg id="sample-qr" viewBox="0 0 29 29" role="presentation"></svg><span className="pr-scan-line"></span></div><strong>Maya Lee <span>A-12-08</span></strong><small>2 parcels · Show at the lobby</small><div className="pr-qr-verification"><Check aria-hidden="true" /><span>Collection confirmed</span></div></div>
            </div>
          </div>

        </div>
      </section>
    </div>);

});


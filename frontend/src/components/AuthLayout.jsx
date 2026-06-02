import buildingIllustration from "../assets/auth-building-illustration.png";
import { navigate } from "../utils/navigation.js";

export function AuthLayout({ children }) {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <button className="brand-lockup" type="button" onClick={() => navigate("/login")}>
          <span>PARCEL NEXUS</span>
          <small>GEM CONDOMINIUM PARCEL MANAGEMENT SYSTEM</small>
        </button>

        <div className="auth-content animate-rise">{children}</div>

        <footer className="auth-footer">
          <span>© 2026 GEM Condominium</span>
          <span>Privacy · Terms · Support</span>
        </footer>
      </section>

      <aside className="auth-visual" aria-hidden="true">
        <img src={buildingIllustration} alt="" />
        <div className="auth-visual-copy">
          <strong>Making Every Parcel Easy to Track</strong>
          <span>MANAGE PARCEL ARRIVALS, NOTIFICATIONS AND COLLECTIONS IN ONE PLACE</span>
        </div>
      </aside>
    </main>
  );
}

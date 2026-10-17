import { Barcode, Camera, CheckCircle2, Clock3, MapPin, Package, ScanLine, ShieldCheck, TimerOff } from "lucide-react";
import { useEffect, useState } from "react";
import { ACTIVE_VERIFICATION, formatCountdown, remainingSeconds } from "../utils/collectionVerification.js";
import { guardVerificationPresentation } from "../utils/guardCollectionVerification.js";
import { parcelRoomLabel } from "../utils/parcelRooms.js";

function malaysiaDate(value) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function GuardCollectionStatus({ session, onScanNext }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (session.status !== ACTIVE_VERIFICATION) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [session.status, session.expires_at]);
  const view = guardVerificationPresentation(session, now);
  const completed = session.status === "COMPLETED", active = session.status === ACTIVE_VERIFICATION;
  const count = session.parcel_count || view.total;
  const Icon = completed ? ShieldCheck : active ? ScanLine : TimerOff;

  return <section className={`guard-collection-status ${view.tone}`} aria-label="Collection verification status">
    <header className="guard-session-status-heading"><span className="guard-session-icon"><Icon size={25} /></span>
      <div><h2>{view.title}</h2><p>{view.description}</p></div></header>
    <p className="guard-session-label" role="status" aria-live="polite" aria-atomic="true"><span>{view.label}</span>
      <span className="sr-only">. {view.title}. {view.verified} of {view.total} parcels verified.</span></p>
    <div className="guard-session-overview"><div><strong>Unit {session.unit_reference || "Not recorded"}</strong>
      <span>{count} {count === 1 ? "Parcel" : "Parcels"}{completed ? " Collected" : " in this session"}</span></div>
      <div>{active ? <span className="guard-session-clock"><Clock3 size={17} /> Verification expires in: <strong>{formatCountdown(remainingSeconds(session.expires_at, now))}</strong></span>
        : <span>{completed ? `Confirmed ${malaysiaDate(session.confirmed_at || session.completed_at)}` : "This session did not complete collection."}</span>}</div></div>
    <div className="guard-session-progress"><strong>{view.verified} of {view.total} parcels verified</strong>
      <progress aria-label="Resident parcel verification progress" max={Math.max(view.total, 1)} value={view.verified} /></div>
    {active && <p className="guard-session-handover">Hand over only the parcels listed below. The Resident must scan each barcode, upload one photo per parcel, and confirm collection.</p>}
    <div className="guard-session-parcels">{session.parcels.map((parcel) => <article key={parcel.parcel_id}>
      <span className="collection-parcel-icon"><Package size={19} /></span><div className="guard-session-parcel-identity">
        <h3>{parcel.registered_tracking_number}</h3><p>{parcel.courier_name || "Courier not recorded"}</p>
        <p><MapPin size={13} /> Parcel Room: {parcelRoomLabel(parcel)}</p>
      </div><div className="guard-session-parcel-checks">
        {completed ? <span className="complete"><CheckCircle2 size={16} /> Collected</span> : <>
          <span className={parcel.barcode_status === "MATCHED" ? "complete" : ""}>{parcel.barcode_status === "MATCHED" ? <CheckCircle2 size={15} /> : <Barcode size={15} />}
            Barcode {parcel.barcode_status === "MATCHED" ? "verified" : parcel.barcode_status === "MISMATCHED" ? "mismatch" : parcel.barcode_status === "UNREADABLE" ? "unreadable" : "pending"}</span>
          <span className={parcel.photo_present ? "complete" : ""}>{parcel.photo_present ? <CheckCircle2 size={15} /> : <Camera size={15} />} Photo {parcel.photo_present ? "uploaded" : "pending"}</span>
        </>}
      </div>
    </article>)}</div>
    <footer className="guard-session-footer"><p>{active ? "Resident verification continues independently when you scan the next QR." : "Ready for the next collection."}</p>
      <button type="button" onClick={onScanNext}><ScanLine size={17} /> Scan Next QR</button></footer>
  </section>;
}

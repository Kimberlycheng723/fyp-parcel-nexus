import { ArrowLeft, Check, Copy, QrCode as QrCodeIcon, RefreshCw, Sun, Timer, TimerOff } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { CollectionVerificationParcel } from "../components/CollectionVerificationParcel.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useCollectionVerification } from "../hooks/useCollectionVerification.js";
import { cancelCollectionVerification, confirmCollectionVerification, createResidentCollection,
  getActiveCollectionVerifications, getCollectionVerification, getResidentParcelDetails } from "../services/api.js";
import { clearResidentCollectionSession, clearVerificationReference, getResidentCollectionSession, saveResidentCollectionSession } from "../utils/collectionSession.js";
import { ACTIVE_VERIFICATION, formatCountdown, remainingSeconds, verificationError, verificationProgress } from "../utils/collectionVerification.js";
import { parcelRoomLabel } from "../utils/parcelRooms.js";
import { navigate } from "../utils/navigation.js";

export function ResidentCollectionPage() {
  const { user } = useAuth();
  const [session, setSession] = useState(() => {
    const saved = getResidentCollectionSession();
    if (saved && saved.resident_id !== user.user_id) { clearResidentCollectionSession(); return null; }
    return saved;
  });
  const collection = session?.collection;
  const { verification, checking, waitingExpired, syncError, unavailable, busy, mutate, refresh } = useCollectionVerification(user.user_id, collection);
  const [qrImage, setQrImage] = useState("");
  const [now, setNow] = useState(Date.now());
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [parcelRooms, setParcelRooms] = useState({});
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [roomError, setRoomError] = useState("");
  const [roomRefresh, setRoomRefresh] = useState(0);
  const [pendingPhotos, setPendingPhotos] = useState(() => new Set());
  const onPhotoPending = useCallback((parcelId, pending) => {
    setPendingPhotos((current) => {
      if (current.has(parcelId) === pending) return current;
      const next = new Set(current);
      if (pending) next.add(parcelId); else next.delete(parcelId);
      return next;
    });
  }, []);
  const wakeLockRef = useRef(null), regenerationRef = useRef(false), confirmingRef = useRef(false);
  const secondsLeft = remainingSeconds(verification?.expires_at || collection?.expires_at, now);
  const completed = verification?.status === "COMPLETED";
  const closed = verification && verification.status !== ACTIVE_VERIFICATION;
  const disabled = busy || unavailable || closed || secondsLeft === 0;
  const progress = verificationProgress(verification, now);
  const verifiedCount = (verification?.parcels || []).filter((parcel) => parcel.barcode_status === "MATCHED" && parcel.photo_present && !pendingPhotos.has(parcel.parcel_id)).length;
  const canConfirm = progress.canConfirm && pendingPhotos.size === 0;

  useEffect(() => {
    if (completed || closed) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [completed, closed]);

  useEffect(() => {
    if (verification) {
      setQrImage("");
      wakeLockRef.current?.release?.().catch(() => {});
      if (completed) clearResidentCollectionSession();
    }
  }, [Boolean(verification), completed]);

  useEffect(() => {
    let disposed = false;
    if (!collection?.token || verification || remainingSeconds(collection.expires_at) === 0) { setQrImage(""); return; }
    QRCode.toDataURL(collection.token, { errorCorrectionLevel: "M", margin: 2, width: 720, color: { dark: "#081d33", light: "#ffffff" } })
      .then((image) => { if (!disposed) setQrImage(image); })
      .catch(() => { if (!disposed) setError("Unable to display the collection QR code."); });
    return () => { disposed = true; };
  }, [collection?.token, Boolean(verification), waitingExpired]);

  useEffect(() => {
    let disposed = false, pending = false;
    const controller = new AbortController();
    async function refreshRooms() {
      if (pending || !collection?.parcels?.length || verification) return;
      pending = true; setIsLoadingRooms(true); setRoomError("");
      const entries = await Promise.all(collection.parcels.map(async (parcel) => {
        try {
          const data = await getResidentParcelDetails(parcel.parcel_id, { signal: controller.signal });
          if (data.parcel?.parcel_id !== parcel.parcel_id) throw new Error("Parcel unavailable");
          return [parcel.parcel_id, { label: parcelRoomLabel(data.parcel) }];
        } catch { return [parcel.parcel_id, { label: "Room information unavailable", unavailable: true }]; }
      }));
      if (!disposed) {
        setParcelRooms(Object.fromEntries(entries)); setIsLoadingRooms(false);
        setRoomError(entries.some(([, room]) => room.unavailable) ? "Some parcel rooms could not be refreshed. Please try again." : "");
      }
      pending = false;
    }
    function onVisible() { if (document.visibilityState === "visible") void refreshRooms(); }
    void refreshRooms(); document.addEventListener("visibilitychange", onVisible);
    return () => { disposed = true; controller.abort(); document.removeEventListener("visibilitychange", onVisible); };
  }, [collection?.collection_id, Boolean(verification), roomRefresh]);

  useEffect(() => () => { wakeLockRef.current?.release?.().catch(() => {}); }, []);

  function handleBack() { navigate("/dashboard"); }
  function handleRestart() { clearResidentCollectionSession(); clearVerificationReference(); navigate("/dashboard"); }

  async function handleCopyCode() {
    try { await navigator.clipboard.writeText(collection.token); setNotice("Collection code copied."); }
    catch { setError("Unable to copy the collection code on this device."); }
  }

  async function handleWakeLock() {
    if (!navigator.wakeLock?.request) { setError("Screen wake lock is not supported by this browser."); return; }
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen"); setIsWakeLockActive(true);
      setNotice("The screen will stay awake while this page is open.");
      wakeLockRef.current.addEventListener("release", () => setIsWakeLockActive(false), { once: true });
    } catch { setError("Unable to keep the screen awake. Please increase brightness manually."); }
  }

  async function handleRegenerate() {
    if (!session?.parcel_ids?.length || regenerationRef.current) return;
    regenerationRef.current = true; setIsRegenerating(true); setError(""); setNotice("");
    try {
      const { verification_sessions = [] } = await getActiveCollectionVerifications();
      if (verification_sessions.some((item) => item.collection_id === collection.collection_id)) { await refresh(); return; }
      const response = await createResidentCollection(session.parcel_ids);
      const nextSession = { ...session, resident_id: user.user_id, collection: response.collection };
      saveResidentCollectionSession(nextSession); setSession(nextSession); setNow(Date.now());
    } catch (requestError) { setError(verificationError(requestError)); }
    finally { regenerationRef.current = false; setIsRegenerating(false); }
  }

  async function handleConfirm() {
    if (!canConfirm || busy || confirmingRef.current || unavailable) return;
    confirmingRef.current = true; setError("");
    try {
      const response = await mutate(async (id) => {
        const current = await getCollectionVerification(id);
        if (!verificationProgress(current.verification_session).canConfirm) return current;
        return confirmCollectionVerification(id);
      });
      if (response?.verification_session?.status === ACTIVE_VERIFICATION) setError("Some parcels still need verification. Please review the current results.");
    } catch (requestError) { setError(verificationError(requestError)); }
    finally { confirmingRef.current = false; }
  }

  async function handleCancel() {
    if (disabled || !window.confirm("Cancel this verification? Your parcels will remain pending collection.")) return;
    setError("");
    try { await mutate((id) => cancelCollectionVerification(id)); }
    catch (requestError) { setError(verificationError(requestError)); }
  }

  if (completed) return <ProtectedLayout hideTopActions><section className="collection-completed-page" role="status">
    <span className="collection-completed-icon"><Check size={38} /></span><h1>Collection Confirmed</h1>
    <p>Your parcels have been successfully collected.</p>
    <button type="button" onClick={handleRestart}><ArrowLeft size={17} /> Back to My Parcels</button>
  </section></ProtectedLayout>;

  if (checking && !verification) return <ProtectedLayout hideTopActions><section className="collection-empty-page"><Spinner /><p>Checking collection status...</p></section></ProtectedLayout>;

  if ((!collection && !verification) || unavailable) return <ProtectedLayout hideTopActions><section className="collection-empty-page">
    <QrCodeIcon size={34} /><h1>{unavailable ? "Verification unavailable" : "No active parcel collection"}</h1>
    <p role={syncError ? "alert" : undefined}>{syncError || "Select pending parcels from My Parcels before generating a QR code."}</p>
    {syncError && !unavailable && <button type="button" onClick={refresh}>Retry</button>}
    <button type="button" onClick={handleBack}>Back to My Parcels</button>
  </section></ProtectedLayout>;

  return <ProtectedLayout hideTopActions><section className="resident-collection-page">
    <header className="collection-page-header"><button type="button" onClick={handleBack} aria-label="Back to My Parcels"><ArrowLeft size={19} /></button><div>
      {verification && <h2>Verify Your Parcels</h2>}
      <p>{verification ? "Scan the barcode and take a photo of each parcel before confirming your collection." : `Unit ${session?.unit?.unit_full_code || "not available"}`}</p>
    </div></header>
    {error && <div className="collection-message error" role="alert">{error}</div>}
    {notice && !verification && <div className="collection-message success" role="status"><Check size={16} />{notice}</div>}
    {syncError && <div className="collection-message neutral" role="status">{syncError}<button type="button" onClick={refresh}>Retry</button></div>}
    {verification ? <>
      <div className="collection-verification-summary"><div><strong>{verifiedCount} of {progress.total} parcels verified</strong>
        <progress max={Math.max(progress.total, 1)} value={verifiedCount} aria-label="Parcel verification progress" /></div>
        <span className={`collection-session-deadline ${secondsLeft === 0 || closed ? "expired" : ""}`}><Timer size={17} />
          {closed ? verification.status === "CANCELLED" ? "Session cancelled" : "Session expired" : secondsLeft === 0 ? "Checking session expiry..." : `Session expires in ${formatCountdown(secondsLeft)}`}</span></div>
      {closed ? <section className="collection-verification-closed"><TimerOff size={32} /><h2>{verification.status === "CANCELLED" ? "Verification cancelled" : "Verification session expired"}</h2>
        <p>Your parcels have not been collected. Return to My Parcels to generate a new QR code and start again.</p>
        <button type="button" onClick={handleRestart}><QrCodeIcon size={17} /> Start a New Collection</button></section>
        : <>
          <div className="collection-verification-grid">{verification.parcels.map((parcel, index) => <CollectionVerificationParcel
            key={`${verification.session_id}:${parcel.parcel_id}`} parcel={parcel} sessionId={verification.session_id}
            index={index} total={progress.total} disabled={Boolean(disabled)} mutate={mutate} onPhotoPending={onPhotoPending} />)}</div>
          <footer className="collection-verification-footer"><div><strong>{progress.total} parcels · Collect together</strong>
            <p>{pendingPhotos.size ? "Upload or discard your photo previews before confirming." : canConfirm ? "All barcodes verified and collection photos uploaded." : "Every parcel needs a matching barcode and an uploaded photo."}</p></div>
            <div><button type="button" disabled={Boolean(disabled)} onClick={handleCancel}>Cancel Verification</button>
              <button type="button" className="primary" disabled={!canConfirm || busy || unavailable} onClick={handleConfirm}><Check size={17} /> {busy && confirmingRef.current ? "Confirming..." : "Confirm Collection"}</button></div></footer>
        </>}
    </> : <>
      <div className={`resident-collection-layout ${waitingExpired ? "expired" : ""}`}><section className="collection-details-panel">
        <h2>{waitingExpired ? "QR code expired" : "Waiting for Guard scan"}</h2><p>{waitingExpired ? "Generate a new secure code to continue collection. Your parcel selection is preserved." : "Show this QR code to the Guard to begin collection."}</p>
        <div className="collection-parcel-list"><div className="collection-parcel-list-heading"><strong>{collection.parcel_count || collection.parcels?.length} parcels selected</strong>
          <button type="button" className="collection-room-refresh" title="Refresh parcel rooms" aria-label="Refresh parcel rooms" disabled={isLoadingRooms} onClick={() => setRoomRefresh((value) => value + 1)}><RefreshCw size={15} /></button></div>
          {(collection.parcels || []).map((parcel) => <article key={parcel.parcel_id}><span className="collection-parcel-icon"><QrCodeIcon size={16} /></span>
            <div><strong>{parcel.courier_name || "Courier"}</strong><span>{parcel.tracking_number}</span><span className="collection-room-name">Parcel Room: {isLoadingRooms ? "Refreshing..." : parcelRooms[parcel.parcel_id]?.label || "Refreshing..."}</span></div>
            <em className={parcel.is_overdue ? "overdue" : "pending"}>{parcel.is_overdue ? "Overdue" : "Pending Collection"}</em></article>)}</div>
        {roomError && <p className="collection-room-error" role="alert">{roomError}</p>}
        <div className={`collection-instruction ${waitingExpired ? "expired" : ""}`}><QrCodeIcon size={19} /><span><strong>{waitingExpired ? "This QR is no longer valid." : "You confirm collection after verification."}</strong> {waitingExpired ? "Codes expire after 2 minutes for security." : "Once scanned, you have 15 minutes to verify every parcel."}</span></div>
      </section><section className="collection-qr-panel">
        {waitingExpired ? <div className="collection-expired-visual"><TimerOff size={58} /><h2>QR Expired</h2><p>Generate a new code to continue collection.</p></div>
          : secondsLeft === 0 ? <div className="collection-qr-loading"><Spinner /><span>Checking whether verification has started...</span></div>
            : qrImage ? <img className="collection-qr-image" src={qrImage} alt="Secure parcel collection QR code" />
              : <div className="collection-qr-loading"><Spinner /><span>Preparing secure QR code...</span></div>}
        <div className={`collection-countdown ${waitingExpired ? "expired" : ""}`}><span>{waitingExpired ? "QR EXPIRED" : "QR EXPIRES IN"}</span><strong>{formatCountdown(secondsLeft)}</strong></div>
      </section></div>
      <footer className="collection-page-actions"><button className="secondary" type="button" onClick={handleBack}><ArrowLeft size={16} /> Back</button>
        {waitingExpired ? <button className="primary" type="button" onClick={handleRegenerate} disabled={isRegenerating}><RefreshCw size={16} /> {isRegenerating ? "Generating..." : "Generate New QR"}</button>
          : secondsLeft > 0 && <><button className="desktop-copy-action" type="button" onClick={handleCopyCode}><Copy size={16} /> Copy code</button>
            <button className="primary mobile-brightness-action" type="button" onClick={handleWakeLock} disabled={isWakeLockActive}><Sun size={16} /> {isWakeLockActive ? "Screen stays awake" : "Keep screen awake"}</button></>}
      </footer>
    </>}
  </section></ProtectedLayout>;
}

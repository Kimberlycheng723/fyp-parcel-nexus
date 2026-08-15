import {
  ArrowLeft,
  Check,
  Copy,
  QrCode as QrCodeIcon,
  RefreshCw,
  Sun,
  TimerOff
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";

import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { createResidentCollection } from "../services/api.js";
import { acquireRealtimeSocket, releaseRealtimeSocket } from "../services/socket.js";
import {
  clearResidentCollectionSession,
  getResidentCollectionSession,
  saveResidentCollectionSession
} from "../utils/collectionSession.js";
import { navigate } from "../utils/navigation.js";

function remainingSeconds(expiresAt) {
  const expiryTime = Date.parse(expiresAt || "");
  return Number.isFinite(expiryTime) ? Math.max(0, Math.ceil((expiryTime - Date.now()) / 1000)) : 0;
}

function formatCountdown(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ResidentCollectionPage() {
  const [session, setSession] = useState(() => getResidentCollectionSession());
  const [qrImage, setQrImage] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(() => remainingSeconds(session?.collection?.expires_at));
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [completedCollection, setCompletedCollection] = useState(null);
  const [realtimeNotice, setRealtimeNotice] = useState("");
  const wakeLockRef = useRef(null);
  const collection = session?.collection;
  const isExpired = !collection || secondsLeft <= 0;

  useEffect(() => {
    if (!collection?.expires_at || completedCollection) {
      return undefined;
    }

    setSecondsLeft(remainingSeconds(collection.expires_at));
    const timer = window.setInterval(() => {
      setSecondsLeft(remainingSeconds(collection.expires_at));
    }, 500);

    return () => window.clearInterval(timer);
  }, [collection?.expires_at, completedCollection]);

  useEffect(() => {
    let isCancelled = false;

    async function renderQr() {
      if (!collection?.token || isExpired || completedCollection) {
        setQrImage("");
        return;
      }

      try {
        const image = await QRCode.toDataURL(collection.token, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 720,
          color: { dark: "#081d33", light: "#ffffff" }
        });

        if (!isCancelled) {
          setQrImage(image);
        }
      } catch (renderError) {
        if (!isCancelled) {
          setError("Unable to display the collection QR code.");
        }
      }
    }

    renderQr();
    return () => {
      isCancelled = true;
    };
  }, [collection?.token, isExpired, completedCollection]);

  useEffect(() => {
    if (!collection?.collection_id || completedCollection) {
      return undefined;
    }

    const socket = acquireRealtimeSocket();

    function handleConnected() {
      setRealtimeNotice("");
    }

    function handleConnectionError(connectionError) {
      const message = connectionError?.message === "Authentication failed."
        ? "Real-time authentication failed. The QR remains valid; return to My Parcels after collection."
        : "Real-time updates are temporarily unavailable. The QR remains valid and REST collection still works.";
      setRealtimeNotice(message);
    }

    function handleDisconnected() {
      setRealtimeNotice("Real-time connection interrupted. Reconnecting automatically...");
    }

    function handleReconnected() {
      setRealtimeNotice("");
    }

    function handleCollectionCompleted(payload) {
      if (payload?.collection_id !== collection.collection_id) {
        return;
      }

      clearResidentCollectionSession();
      setSecondsLeft(0);
      setQrImage("");
      setError("");
      setNotice("");
      setRealtimeNotice("");
      setCompletedCollection(payload);
      wakeLockRef.current?.release?.().catch(() => {});
    }

    socket.off("connect", handleConnected);
    socket.off("connect_error", handleConnectionError);
    socket.off("disconnect", handleDisconnected);
    socket.off("collection:completed", handleCollectionCompleted);
    socket.io.off("reconnect", handleReconnected);

    socket.on("connect", handleConnected);
    socket.on("connect_error", handleConnectionError);
    socket.on("disconnect", handleDisconnected);
    socket.on("collection:completed", handleCollectionCompleted);
    socket.io.on("reconnect", handleReconnected);

    return () => {
      socket.off("connect", handleConnected);
      socket.off("connect_error", handleConnectionError);
      socket.off("disconnect", handleDisconnected);
      socket.off("collection:completed", handleCollectionCompleted);
      socket.io.off("reconnect", handleReconnected);
      releaseRealtimeSocket();
    };
  }, [collection?.collection_id, completedCollection]);

  useEffect(() => () => {
    wakeLockRef.current?.release?.().catch(() => {});
  }, []);

  const parcelCountLabel = useMemo(() => {
    const count = Number(collection?.parcel_count || collection?.parcels?.length || 0);
    return `${count} ${count === 1 ? "parcel" : "parcels"}`;
  }, [collection]);

  if (completedCollection) {
    return (
      <ProtectedLayout hideTopActions>
        <section className="collection-completed-page animate-rise" role="status">
          <span className="collection-completed-icon"><Check size={38} /></span>
          <h1>Collection Completed</h1>
          <p>Your parcel(s) have been successfully collected.</p>
          <button type="button" onClick={() => navigate("/dashboard")}>
            <ArrowLeft size={17} /> Back to My Parcels
          </button>
        </section>
      </ProtectedLayout>
    );
  }

  function handleBack() {
    clearResidentCollectionSession();
    navigate("/dashboard");
  }

  async function handleCopyCode() {
    if (!collection?.token) {
      return;
    }

    try {
      await navigator.clipboard.writeText(collection.token);
      setNotice("Collection code copied.");
    } catch (copyError) {
      setError("Unable to copy the collection code on this device.");
    }
  }

  async function handleWakeLock() {
    if (!navigator.wakeLock?.request) {
      setError("Screen wake lock is not supported by this browser.");
      return;
    }

    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
      setIsWakeLockActive(true);
      setNotice("The screen will stay awake while this page is open.");
      wakeLockRef.current.addEventListener("release", () => setIsWakeLockActive(false), { once: true });
    } catch (wakeError) {
      setError("Unable to keep the screen awake. Please increase brightness manually.");
    }
  }

  async function handleRegenerate() {
    const parcelIds = session?.parcel_ids || [];

    if (parcelIds.length === 0 || isRegenerating) {
      return;
    }

    setIsRegenerating(true);
    setError("");
    setNotice("");

    try {
      const response = await createResidentCollection(parcelIds);
      const nextSession = { ...session, collection: response.collection };
      saveResidentCollectionSession(nextSession);
      setSession(nextSession);
      setSecondsLeft(remainingSeconds(response.collection.expires_at));
    } catch (requestError) {
      setError(requestError.message || "Unable to generate a new QR code.");
    } finally {
      setIsRegenerating(false);
    }
  }

  if (!session?.collection) {
    return (
      <ProtectedLayout hideTopActions>
        <section className="collection-empty-page">
          <QrCodeIcon size={34} />
          <h1>No active parcel collection</h1>
          <p>Select pending parcels from My Parcels before generating a QR code.</p>
          <button type="button" onClick={() => navigate("/dashboard")}>Back to My Parcels</button>
        </section>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout hideTopActions>
      <section className="resident-collection-page animate-rise">
        <header className="collection-page-header">
          <button type="button" onClick={handleBack} aria-label="Back to My Parcels"><ArrowLeft size={19} /></button>
          <div>
            <h1>Parcel Collection</h1>
            <p>Unit {session?.unit?.unit_full_code || "not available"}</p>
          </div>
        </header>

        {error && <div className="collection-message error" role="alert">{error}</div>}
        {notice && <div className="collection-message success" role="status"><Check size={16} />{notice}</div>}
        {realtimeNotice && <div className="collection-message neutral" role="status">{realtimeNotice}</div>}

        <div className={`resident-collection-layout ${isExpired ? "expired" : ""}`}>
          <section className="collection-details-panel">
            <span>COLLECTION</span>
            <h2>{isExpired ? "QR code expired" : "Ready to collect"}</h2>
            <p>
              {isExpired
                ? "Generate a new secure code to continue collection. Your parcel selection is preserved."
                : "Show the QR code to the guard. The guard will scan it and hand over your parcels."}
            </p>

            <div className="collection-parcel-list">
              <div className="collection-parcel-list-heading">
                <strong>{parcelCountLabel} selected</strong>
              </div>
              {(collection.parcels || []).map((parcel) => (
                <article key={parcel.parcel_id}>
                  <span className="collection-parcel-icon"><QrCodeIcon size={16} /></span>
                  <div>
                    <strong>{parcel.courier_name || "Courier"}</strong>
                    <span>{parcel.tracking_number}</span>
                  </div>
                  <em className={parcel.is_overdue ? "overdue" : "pending"}>
                    {parcel.is_overdue ? "Overdue" : "Pending Collection"}
                  </em>
                </article>
              ))}
            </div>

            <div className={`collection-instruction ${isExpired ? "expired" : ""}`}>
              {isExpired ? <TimerOff size={19} /> : <QrCodeIcon size={19} />}
              <span>
                <strong>{isExpired ? "This QR is no longer valid." : "Show this QR code to the guard to complete collection."}</strong>
                {isExpired ? " Codes expire after 2 minutes for security." : " The code expires according to the time shown."}
              </span>
            </div>
          </section>

          <section className="collection-qr-panel">
            {isExpired ? (
              <div className="collection-expired-visual">
                <TimerOff size={58} />
                <h2>QR Expired</h2>
                <p>Generate a new code to continue collection.</p>
              </div>
            ) : qrImage ? (
              <img className="collection-qr-image" src={qrImage} alt="Secure parcel collection QR code" />
            ) : (
              <div className="collection-qr-loading"><Spinner /><span>Preparing secure QR code...</span></div>
            )}

            <div className={`collection-countdown ${isExpired ? "expired" : ""}`}>
              <span>{isExpired ? "EXPIRED" : "EXPIRES IN"}</span>
              <strong>{formatCountdown(secondsLeft)}</strong>
            </div>
          </section>
        </div>

        <footer className="collection-page-actions">
          <button className="secondary" type="button" onClick={handleBack}><ArrowLeft size={16} /> Back</button>
          {isExpired ? (
            <button className="primary" type="button" onClick={handleRegenerate} disabled={isRegenerating}>
              <RefreshCw size={16} /> {isRegenerating ? "Generating..." : "Generate New QR"}
            </button>
          ) : (
            <>
              <button className="desktop-copy-action" type="button" onClick={handleCopyCode}><Copy size={16} /> Copy code</button>
              <button className="primary mobile-brightness-action" type="button" onClick={handleWakeLock} disabled={isWakeLockActive}>
                <Sun size={16} /> {isWakeLockActive ? "Screen stays awake" : "Brighten screen"}
              </button>
            </>
          )}
        </footer>
      </section>
    </ProtectedLayout>
  );
}

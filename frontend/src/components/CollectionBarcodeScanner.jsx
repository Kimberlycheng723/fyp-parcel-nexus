import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cameraErrorMessage } from "../utils/collectionVerification.js";

export function CollectionBarcodeScanner({ id, onDetected, onClose }) {
  const videoRef = useRef(null);
  const detectedRef = useRef(onDetected);
  detectedRef.current = onDetected;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("starting");
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false, interrupted = false, detected = false, stream, controls, timeout;
    const video = videoRef.current;
    const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 250 });
    function stop() {
      window.clearTimeout(timeout);
      controls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (video) { video.pause(); video.srcObject = null; }
    }
    async function start() {
      setStatus("starting"); setError("");
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error"); setError("Camera scanning is unavailable in this browser. Enter the tracking number manually instead."); return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
          facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }
        } });
        if (disposed || interrupted) { stop(); return; }
        video.srcObject = stream;
        await video.play();
        if (disposed || interrupted) { stop(); return; }
        setStatus("scanning");
        controls = await reader.decodeFromStream(stream, video, (result, _error, activeControls) => {
          if (!result || disposed || detected) return;
          detected = true;
          activeControls.stop(); stop();
          detectedRef.current(result.getText());
        });
        if (disposed || interrupted || detected) { stop(); return; }
        timeout = window.setTimeout(() => {
          stop(); setStatus("error");
          setError("No barcode detected. Improve the lighting and try again, or enter the tracking number manually.");
        }, 25000);
      } catch (cameraError) {
        stop();
        if (!disposed) { setStatus("error"); setError(cameraErrorMessage(cameraError)); }
      }
    }
    function onHidden() { if (document.visibilityState === "hidden") { interrupted = true; stop(); setStatus("error"); setError("Camera paused. Tap Try Again when you are ready."); } }
    void start();
    document.addEventListener("visibilitychange", onHidden);
    return () => { disposed = true; stop(); document.removeEventListener("visibilitychange", onHidden); };
  }, [attempt]);

  return <section id={id} className="collection-barcode-camera" aria-label="Barcode scanner">
    <div className="collection-scanner-toolbar"><strong><Camera size={16} /> Scan parcel barcode</strong>
      <button type="button" autoFocus onClick={onClose} aria-label="Close barcode scanner"><X size={18} /></button></div>
    <div className="collection-scanner-preview" hidden={status === "error"}>
      <video ref={videoRef} muted autoPlay playsInline aria-label="Barcode camera preview" />
      <div className="collection-barcode-frame" aria-hidden="true" />
      <span>{status === "starting" ? "Starting camera..." : "Keep the shipping barcode inside the frame"}</span>
    </div>
    {status === "error" && <><p role="alert">{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={16} /> Try Again</button></>}
  </section>;
}

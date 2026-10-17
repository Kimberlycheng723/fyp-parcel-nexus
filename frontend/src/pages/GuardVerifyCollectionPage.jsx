import { BrowserQRCodeReader } from "@zxing/browser";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Flashlight,
  RefreshCw,
  ScanLine
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { GuardCollectionStatus } from "../components/GuardCollectionStatus.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useGuardCollectionVerification } from "../hooks/useGuardCollectionVerification.js";
import { verifyGuardCollection } from "../services/api.js";
import { guardCollectionError } from "../utils/guardCollectionVerification.js";
import { navigate } from "../utils/navigation.js";

function cameraErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "Camera permission was denied. Allow camera access in your browser settings and try again.";
  }

  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return "No camera is available on this device.";
  }

  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
    return "The camera is being used by another application. Close it and try again.";
  }

  if (error?.name === "VideoPlaybackError") {
    return "Camera access was granted, but Safari could not start the live preview. Tap Try Again to start it.";
  }

  return "Unable to start the camera. Check browser permissions and try again.";
}

function stopMediaStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

async function startVideoPreview(video, stream) {
  if (!video) {
    const error = new Error("Camera preview is unavailable.");
    error.name = "VideoPlaybackError";
    throw error;
  }

  video.autoplay = true;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("autoplay", "");
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.srcObject = stream;

  try {
    await video.play();
  } catch (playbackError) {
    const error = new Error("Camera playback failed.");
    error.name = "VideoPlaybackError";
    error.cause = playbackError;
    throw error;
  }
}

function videoTrackSupportsTorch(track) {
  if (!track || typeof track.getCapabilities !== "function") {
    return false;
  }

  try {
    return track.getCapabilities()?.torch === true;
  } catch (capabilityError) {
    return false;
  }
}

export function GuardVerifyCollectionPage() {
  const { user } = useAuth();
  const verification = useGuardCollectionVerification(user.user_id);
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const streamRef = useRef(null);
  const videoTrackRef = useRef(null);
  const verifyingRef = useRef(false);
  const retryVerificationRef = useRef(null);
  const [scanSession, setScanSession] = useState(0);
  const [status, setStatus] = useState("starting");
  const [error, setError] = useState("");
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchMessage, setTorchMessage] = useState("");

  useEffect(() => {
    if (verification.sessionId) return;
    let isCancelled = false, interrupted = false, scanTimeout;
    const video = videoRef.current;
    const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });

    function releaseCamera() {
      window.clearTimeout(scanTimeout);
      controlsRef.current?.stop?.();
      controlsRef.current = null;
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      videoTrackRef.current = null;

      if (video) {
        video.pause();
        video.srcObject = null;
      }
    }

    async function verifyToken(token, controls) {
      if (!token || verifyingRef.current || isCancelled) {
        return;
      }

      verifyingRef.current = true;
      retryVerificationRef.current = null;
      controls?.stop();
      releaseCamera();
      setStatus("verifying");
      setError("");

      try {
        const response = await verifyGuardCollection(token);

        if (!isCancelled) {
          verification.watch(response);
          setStatus("monitoring");
        }
      } catch (requestError) {
        if (!isCancelled) {
          // Explicit retry retrieves the same initiated session when its acknowledgement was lost.
          // The QR stays only in this short-lived closure, never browser storage or UI text.
          if (requestError instanceof TypeError || requestError.status >= 500) {
            retryVerificationRef.current = () => {
              verifyingRef.current = false;
              void verifyToken(token);
            };
          }
          setError(guardCollectionError(requestError, { scanning: true }));
          setStatus("error");
        }
      }
    }

    async function startScanner() {
      setStatus("starting");
      setError("");
      setHasTorch(false);
      setTorchOn(false);
      setTorchMessage("");
      verifyingRef.current = false;
      retryVerificationRef.current = null;

      if (document.visibilityState === "hidden") {
        interrupted = true;
        setStatus("camera-paused");
        setError("Camera paused. Start scanning again when you are ready.");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("camera-error");
        setError("Camera scanning is not supported by this browser.");
        return;
      }

      let stream;

      try {
        stream = await navigator.mediaDevices.getUserMedia(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          }
        );

        if (isCancelled || interrupted) {
          stopMediaStream(stream);
          return;
        }

        streamRef.current = stream;
        const activeVideoTrack = stream.getVideoTracks()[0] || null;
        videoTrackRef.current = activeVideoTrack;

        await startVideoPreview(video, stream);

        if (isCancelled || interrupted) {
          stopMediaStream(stream);
          return;
        }

        setHasTorch(videoTrackSupportsTorch(activeVideoTrack));
        setTorchMessage(videoTrackSupportsTorch(activeVideoTrack) ? "" : "Torch unavailable on this device");

        const controls = await reader.decodeFromStream(
          stream,
          video,
          (scanResult, _scanError, activeControls) => {
            if (scanResult && !isCancelled && !interrupted) {
              verifyToken(scanResult.getText()?.trim(), activeControls);
            }
          }
        );

        if (isCancelled || interrupted || verifyingRef.current) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        if (!verifyingRef.current) {
          setStatus("scanning");
          scanTimeout = window.setTimeout(() => {
            releaseCamera();
            setError("No QR code detected. Improve the lighting and hold the Resident's collection QR inside the frame, then try again.");
            setStatus("scan-error");
          }, 25000);
        }
      } catch (cameraError) {
        stopMediaStream(stream || streamRef.current);
        releaseCamera();

        if (!isCancelled && !interrupted) {
          setStatus("camera-error");
          setError(cameraErrorMessage(cameraError));
        }
      }
    }

    startScanner();

    function onHidden() {
      if (document.visibilityState === "hidden") {
        interrupted = true; releaseCamera();
        if (!verifyingRef.current) { setError("Camera paused. Start scanning again when you are ready."); setStatus("camera-paused"); }
      }
    }
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      isCancelled = true;
      retryVerificationRef.current = null;
      releaseCamera();
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [scanSession, verification.sessionId]);

  function resetScanner() {
    controlsRef.current?.stop?.();
    controlsRef.current = null;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    videoTrackRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    verifyingRef.current = false;
    verification.reset();
    setStatus("starting");
    setScanSession((current) => current + 1);
  }

  async function toggleTorch() {
    const activeTrack = videoTrackRef.current;

    if (!videoTrackSupportsTorch(activeTrack)) {
      setHasTorch(false);
      setTorchMessage("Torch unavailable on this device");
      return;
    }

    try {
      const nextTorchState = !torchOn;
      await activeTrack.applyConstraints({
        advanced: [{ torch: nextTorchState }]
      });
      setTorchOn(nextTorchState);
      setTorchMessage("");
    } catch (torchError) {
      setHasTorch(false);
      setTorchOn(false);
      setTorchMessage("Torch unavailable in this browser");
    }
  }

  const scannerUnavailable = ["error", "camera-error", "camera-paused", "scan-error"].includes(status);

  return (
    <ProtectedLayout hideTopActions>
      <section className="guard-verify-page">
        <header className="verify-page-header">
          <button type="button" onClick={() => navigate("/dashboard")} aria-label="Back to Guard Dashboard"><ArrowLeft size={19} /></button>
          <div>
            <p>Scan a Resident&apos;s QR code to begin verification.</p>
          </div>
        </header>

        {verification.sessionId ? <>
          {verification.error && <div className="collection-message error" role="alert">{verification.error}
            <button type="button" onClick={verification.refresh}><RefreshCw size={15} /> Refresh Status</button></div>}
          {verification.checking && !verification.session ? <div className="guard-session-loading" role="status"><Spinner /><p>Restoring verification status...</p></div>
            : verification.session && !verification.unavailable ? <GuardCollectionStatus session={verification.session} onScanNext={resetScanner} />
              : <section className="guard-session-unavailable"><AlertTriangle size={32} /><h2>Verification unavailable</h2>
                <p>Check your connection or scan a Resident&apos;s collection QR code to continue.</p><button type="button" onClick={resetScanner}><ScanLine size={17} /> Scan Next QR</button></section>}
        </> : <>
        {scannerUnavailable && <section className="verify-result-card error" role="alert">
            <span className="verify-result-icon"><AlertTriangle size={34} /></span>
            <h2>{status === "camera-paused" ? "Scanner paused" : status === "scan-error" ? "QR not detected" : status === "camera-error" ? "Camera unavailable" : "QR verification failed"}</h2>
            <p>{error}</p>
            {retryVerificationRef.current && <button type="button" onClick={() => retryVerificationRef.current?.()}><RefreshCw size={17} /> Refresh Verification</button>}
            <button type="button" onClick={resetScanner}><ScanLine size={17} /> {status === "camera-paused" ? "Start Scanner" : retryVerificationRef.current ? "Scan Another QR" : "Try Again"}</button>
          </section>}
          <div hidden={scannerUnavailable}>
            <section className="verify-camera-card" aria-label="Collection QR scanner">
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                aria-label="QR scanner camera preview"
              />
              <div className="verify-camera-shade" aria-hidden="true" />
              <div className="verify-scan-frame" aria-hidden="true"><ScanLine size={52} /></div>
              {(status === "starting" || status === "verifying") && (
                <div className="verify-camera-loading">
                  <Spinner />
                  <span>{status === "verifying" ? "Starting verification..." : "Starting camera..."}</span>
                </div>
              )}
            </section>

            <div className="verify-instructions">
              <h2>Scan the Resident&apos;s QR code to begin verification</h2>
              <p>Hold the QR code inside the frame. Scanning does not confirm collection.</p>
            </div>

            <div className="verify-camera-actions">
              {hasTorch && (
                <button type="button" onClick={toggleTorch} aria-pressed={torchOn}>
                  <Flashlight size={16} /> {torchOn ? "Torch On" : "Torch Off"}
                </button>
              )}
              {!hasTorch && <span><Camera size={16} /> {status === "starting" ? "Starting camera..." : status === "verifying" ? "Camera stopped" : torchMessage || "Camera active"}</span>}
              <button type="button" onClick={() => {
                controlsRef.current?.stop?.(); stopMediaStream(streamRef.current);
                if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
                navigate("/dashboard");
              }}><ArrowLeft size={16} /> Close Scanner</button>
            </div>
          </div>
        </>}
      </section>
    </ProtectedLayout>
  );
}

import { BrowserQRCodeReader } from "@zxing/browser";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  Flashlight,
  RefreshCw,
  ScanLine
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { verifyGuardCollection } from "../services/api.js";
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
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const streamRef = useRef(null);
  const videoTrackRef = useRef(null);
  const verifyingRef = useRef(false);
  const [scanSession, setScanSession] = useState(0);
  const [status, setStatus] = useState("starting");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchMessage, setTorchMessage] = useState("");

  useEffect(() => {
    let isCancelled = false;
    const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 250 });

    function releaseCamera() {
      controlsRef.current?.stop?.();
      controlsRef.current = null;
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      videoTrackRef.current = null;

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    }

    async function verifyToken(token, controls) {
      if (!token || verifyingRef.current || isCancelled) {
        return;
      }

      verifyingRef.current = true;
      controls?.stop();
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      videoTrackRef.current = null;
      setStatus("verifying");
      setError("");

      try {
        const response = await verifyGuardCollection(token);

        if (!isCancelled) {
          setResult(response);
          setStatus("success");
        }
      } catch (requestError) {
        if (!isCancelled) {
          const expiredHelp = requestError.status === 410
            ? " Ask the resident to generate a new QR code."
            : "";
          setError(`${requestError.message || "Unable to verify this collection code."}${expiredHelp}`);
          setStatus("error");
        }
      }
    }

    async function startScanner() {
      setStatus("starting");
      setError("");
      setResult(null);
      setHasTorch(false);
      setTorchOn(false);
      setTorchMessage("");
      verifyingRef.current = false;

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

        if (isCancelled) {
          stopMediaStream(stream);
          return;
        }

        streamRef.current = stream;
        const activeVideoTrack = stream.getVideoTracks()[0] || null;
        videoTrackRef.current = activeVideoTrack;

        await startVideoPreview(videoRef.current, stream);

        if (isCancelled) {
          stopMediaStream(stream);
          return;
        }

        setHasTorch(videoTrackSupportsTorch(activeVideoTrack));
        setTorchMessage(videoTrackSupportsTorch(activeVideoTrack) ? "" : "Torch unavailable on this device");

        const controls = await reader.decodeFromStream(
          stream,
          videoRef.current,
          (scanResult, _scanError, activeControls) => {
            if (scanResult && !isCancelled) {
              verifyToken(scanResult.getText()?.trim(), activeControls);
            }
          }
        );

        if (isCancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        if (!verifyingRef.current) {
          setStatus("scanning");
        }
      } catch (cameraError) {
        controlsRef.current?.stop?.();
        controlsRef.current = null;
        stopMediaStream(stream || streamRef.current);
        streamRef.current = null;
        videoTrackRef.current = null;

        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.srcObject = null;
        }

        if (!isCancelled) {
          setStatus("camera-error");
          setError(cameraErrorMessage(cameraError));
        }
      }
    }

    startScanner();

    return () => {
      isCancelled = true;
      releaseCamera();
    };
  }, [scanSession]);

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

  const collection = result?.collection;

  return (
    <ProtectedLayout hideTopActions>
      <section className="guard-verify-page animate-rise">
        <header className="verify-page-header">
          <button type="button" onClick={() => navigate("/dashboard")} aria-label="Back to Guard Dashboard"><ArrowLeft size={19} /></button>
          <div>
            <h1>Verify Collection</h1>
            <p>GUARD / PARCELS / VERIFY COLLECTION</p>
          </div>
        </header>

        {status === "success" ? (
          <section className="verify-result-card success" role="status">
            <span className="verify-result-icon"><Check size={34} /></span>
            <h2>Collection successful</h2>
            <p>{result?.message || "The selected parcels have been collected."}</p>
            <strong>{collection?.parcel_count || collection?.parcels?.length || 0} parcels collected</strong>
            <div className="verify-parcel-results">
              {(collection?.parcels || []).map((parcel) => (
                <article key={parcel.parcel_id}>
                  <div>
                    <span>Tracking number</span>
                    <strong>{parcel.tracking_number}</strong>
                  </div>
                  <em>Collected</em>
                </article>
              ))}
            </div>
            <button type="button" onClick={resetScanner}><ScanLine size={17} /> Scan Next QR</button>
          </section>
        ) : status === "error" || status === "camera-error" ? (
          <section className="verify-result-card error" role="alert">
            <span className="verify-result-icon"><AlertTriangle size={34} /></span>
            <h2>{status === "camera-error" ? "Camera unavailable" : "QR verification failed"}</h2>
            <p>{error}</p>
            <button type="button" onClick={resetScanner}><RefreshCw size={17} /> Try Again</button>
          </section>
        ) : (
          <>
            <section className="verify-camera-card">
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
                  <span>{status === "verifying" ? "Verifying collection..." : "Starting camera..."}</span>
                </div>
              )}
            </section>

            <div className="verify-instructions">
              <h2>Scan the resident&apos;s QR code to verify collection</h2>
              <p>Hold the QR code inside the frame until it is detected.</p>
            </div>

            <div className="verify-camera-actions">
              {hasTorch && (
                <button type="button" onClick={toggleTorch} aria-pressed={torchOn}>
                  <Flashlight size={16} /> {torchOn ? "Torch On" : "Torch Off"}
                </button>
              )}
              {!hasTorch && <span><Camera size={16} /> {torchMessage || "Camera active"}</span>}
            </div>
          </>
        )}
      </section>
    </ProtectedLayout>
  );
}

import { AlertCircle, Barcode, Camera, CheckCircle2, ImagePlus, MapPin, Package, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CollectionBarcodeScanner } from "./CollectionBarcodeScanner.jsx";
import { GuidedParcelCamera } from "./GuidedParcelCamera.jsx";
import { getCollectionPhoto, uploadCollectionPhoto, verifyCollectionBarcode } from "../services/api.js";
import { parcelRoomLabel } from "../utils/parcelRooms.js";
import { validateCollectionPhoto, validateTrackingNumber, verificationError } from "../utils/collectionVerification.js";

export function CollectionVerificationParcel({ parcel, sessionId, index, total, disabled, mutate, onPhotoPending }) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [tracking, setTracking] = useState("");
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState("");
  const [storedPhoto, setStoredPhoto] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoRetry, setPhotoRetry] = useState(0);
  const [feedback, setFeedback] = useState("");
  const fileInput = useRef(null), actionRef = useRef(false);
  const scannerTrigger = useRef(null), manualTrigger = useRef(null), manualInput = useRef(null), restoreFocus = useRef(null);
  const matched = parcel.barcode_status === "MATCHED";
  const ready = matched && parcel.photo_present && !photo;
  const mismatch = parcel.barcode_status === "MISMATCHED";

  useEffect(() => {
    if (!photo) { setPreview(""); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    let disposed = false, url;
    const controller = new AbortController();
    setStoredPhoto(""); setPhotoError("");
    if (parcel.photo_present) getCollectionPhoto(sessionId, parcel.parcel_id, { signal: controller.signal }).then(({ blob }) => {
      if (disposed) return;
      url = URL.createObjectURL(blob); setStoredPhoto(url);
    }).catch((requestError) => { if (!disposed && requestError.name !== "AbortError") setPhotoError("Saved photo could not be loaded. Please try again."); });
    return () => { disposed = true; controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [sessionId, parcel.parcel_id, parcel.photo_present, parcel.photo_uploaded_at, photoRetry]);

  useEffect(() => { if (disabled) { setScannerOpen(false); setCameraOpen(false); } }, [disabled]);
  useEffect(() => () => onPhotoPending(parcel.parcel_id, false), [parcel.parcel_id, onPhotoPending]);
  useEffect(() => { if (manualOpen) manualInput.current?.focus(); }, [manualOpen]);
  useEffect(() => {
    if (!disabled && !action && restoreFocus.current) { restoreFocus.current.focus(); restoreFocus.current = null; }
  }, [disabled, action, scannerOpen, manualOpen]);

  function selectPhoto(value) { setPhoto(value); onPhotoPending(parcel.parcel_id, Boolean(value)); }
  function closeScanner() { setScannerOpen(false); scannerTrigger.current?.focus(); }

  async function submitBarcode(value) {
    restoreFocus.current = scannerOpen ? scannerTrigger.current : manualTrigger.current;
    setScannerOpen(false);
    if (disabled || actionRef.current) return;
    const validation = validateTrackingNumber(value);
    if (validation) { setError(validation); return; }
    actionRef.current = true; setAction("barcode"); setError(""); setFeedback("");
    try {
      const result = await mutate((id) => verifyCollectionBarcode(id, parcel.parcel_id, { scanned_tracking_number: value.trim() }));
      const current = result?.verification_session?.parcels.find((item) => item.parcel_id === parcel.parcel_id);
      if (current?.barcode_status === "MATCHED") { setManualOpen(false); setTracking(""); setFeedback("Barcode verified."); }
    } catch (requestError) { setError(verificationError(requestError)); }
    finally { actionRef.current = false; setAction(""); }
  }

  function choosePhoto(event) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    const validation = validateCollectionPhoto(selected);
    setError(validation);
    if (!validation) selectPhoto(selected);
  }
  function useCameraPhoto(file) {
    setCameraOpen(false);
    if (disabled || actionRef.current) return;
    const validation = validateCollectionPhoto(file);
    setError(validation);
    if (!validation) selectPhoto(file);
  }

  async function acceptPhoto() {
    if (disabled || actionRef.current || !photo) return;
    actionRef.current = true; setAction("photo"); setError(""); setFeedback("");
    try {
      const result = await mutate((id) => uploadCollectionPhoto(id, parcel.parcel_id, photo));
      if (result?.verification_session?.parcels.find((item) => item.parcel_id === parcel.parcel_id)?.photo_present) { selectPhoto(null); setFeedback("Collection photo uploaded."); }
    } catch (requestError) { setError(verificationError(requestError)); }
    finally { actionRef.current = false; setAction(""); }
  }

  return <article className={`collection-verification-parcel ${ready ? "ready" : ""}`} aria-label={`Parcel ${index + 1} of ${total}`}>
    <header><span className="collection-parcel-icon"><Package size={19} /></span><div>
      <span>Parcel {index + 1} of {total} · {parcel.courier_name || "Courier not recorded"}</span>
      <h2>{parcel.registered_tracking_number}</h2>
    </div><span className={`collection-verification-badge ${ready ? "ready" : "pending"}`}>
      {ready ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}{ready ? "Ready" : "Needs verification"}</span></header>
    <p className="collection-verification-room"><MapPin size={14} /> Parcel Room: {parcelRoomLabel(parcel)}</p>
    <div className="collection-verification-checks">
      <span className={matched ? "complete" : ""}>{matched ? <CheckCircle2 size={16} /> : <Barcode size={16} />}
        Barcode: {matched ? "Verified" : mismatch ? "Mismatch" : parcel.barcode_status === "UNREADABLE" ? "Unreadable" : "Not verified"}</span>
      <span className={parcel.photo_present ? "complete" : ""}>{parcel.photo_present ? <CheckCircle2 size={16} /> : <Camera size={16} />}
        Photo: {photo ? "Preview awaiting upload" : parcel.photo_present ? "Uploaded" : "Not uploaded"}</span>
    </div>
    {mismatch && <p className="collection-inline-error" role="alert">Barcode does not match this parcel. Please check the parcel and try again.</p>}
    {error && <p className="collection-inline-error" role="alert">{error}</p>}
    <div className="collection-parcel-verification-actions">
      <button ref={scannerTrigger} type="button" disabled={disabled} aria-expanded={scannerOpen} aria-controls={`scanner-${parcel.parcel_id}`} onClick={() => { setError(""); setScannerOpen(true); }}><Barcode size={16} /> {matched ? "Scan again" : "Scan Barcode"}</button>
      <button ref={manualTrigger} type="button" disabled={disabled} aria-expanded={manualOpen} aria-controls={`manual-${parcel.parcel_id}`} onClick={() => { setManualOpen((value) => !value); manualTrigger.current?.focus(); }}>Enter tracking number</button>
      <button type="button" disabled={disabled} onClick={() => { setScannerOpen(false); setCameraOpen(true); }}><Camera size={16} /> {parcel.photo_present ? "Retake Photo" : "Take Photo"}</button>
      <button type="button" disabled={disabled} onClick={() => fileInput.current.click()}><ImagePlus size={16} /> Choose Photo</button>
    </div>
    <input hidden ref={fileInput} type="file" accept="image/jpeg,image/png" aria-label="Choose parcel photo" onChange={choosePhoto} />
    {action && <p role="status">{action === "barcode" ? "Verifying barcode..." : "Uploading photo..."}</p>}
    {feedback && <p className="collection-verification-feedback" role="status">{feedback}</p>}
    {scannerOpen && !disabled && <CollectionBarcodeScanner id={`scanner-${parcel.parcel_id}`} onClose={closeScanner} onDetected={(value) => void submitBarcode(value)} />}
    {cameraOpen && !disabled && <GuidedParcelCamera onClose={() => setCameraOpen(false)} onUse={useCameraPhoto} onUpload={() => fileInput.current?.click()} />}
    {manualOpen && <form id={`manual-${parcel.parcel_id}`} className="collection-manual-barcode" onSubmit={(event) => { event.preventDefault(); void submitBarcode(tracking); }}>
      <label htmlFor={`tracking-${parcel.parcel_id}`}>Tracking number on the shipping label</label>
      <div><input ref={manualInput} id={`tracking-${parcel.parcel_id}`} value={tracking} maxLength={120} autoComplete="off" onChange={(event) => setTracking(event.target.value)} disabled={disabled} />
        <button type="submit" disabled={disabled || Boolean(validateTrackingNumber(tracking))}>Verify</button></div>
    </form>}
    {(photo || parcel.photo_present) && <div className="collection-photo-review">
      {preview || storedPhoto ? <img src={preview || storedPhoto} alt={photo ? "Parcel photo preview, not yet uploaded" : "Uploaded parcel collection photo"} />
        : <p role="status">{photoError || "Loading saved photo..."}</p>}
      <div><strong>{photo ? "Review your photo" : "Collection photo uploaded"}</strong>
        <p>{photo ? "Keep the parcel and shipping label clearly visible. JPG or PNG, up to 5 MB." : "Saved securely for this collection."}</p>
        {photo && <><button type="button" className="primary" disabled={disabled} onClick={acceptPhoto}><Upload size={16} /> {action === "photo" ? "Uploading..." : "Use & Upload Photo"}</button>
          <button type="button" disabled={disabled} onClick={() => { setScannerOpen(false); setCameraOpen(true); }}><Camera size={16} /> Retake</button>
          <button type="button" disabled={disabled} onClick={() => selectPhoto(null)} aria-label="Discard photo preview"><X size={17} /></button></>}
        {!photo && photoError && <button type="button" onClick={() => setPhotoRetry((value) => value + 1)}>Retry photo</button>}
      </div>
    </div>}
    {!photo && !parcel.photo_present && <p className="collection-photo-guide">Take a clear photo of the parcel with the shipping label visible.</p>}
  </article>;
}

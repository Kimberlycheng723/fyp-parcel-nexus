import { Package, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parcelRoomLabel } from "../utils/parcelRooms.js";
import { getParcelRegistrationPhoto } from "../services/api.js";

function dateTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).format(date);
}

function DetailRow({ label, value }) {
  return <div className="parcel-detail-row"><span>{label}</span><strong>{value}</strong></div>;
}

export function ParcelDetailsDialog({ parcel, onClose, resident = false }) {
  const dialogRef = useRef(null);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [resolvedPhotoUrl, setResolvedPhotoUrl] = useState("");
  const photoPath = String(parcel.parcel_photo_url || "").trim();
  const status = parcel.display_status || (parcel.is_overdue ? "OVERDUE" : parcel.status);
  const statusClass = status === "COLLECTED" ? "collected" : status === "OVERDUE" ? "overdue" : "pending";
  const statusText = statusClass === "collected" ? "Collected" : statusClass === "overdue" ? "Overdue" : "Pending Collection";
  const staff = parcel.registered_by_user;
  const staffName = staff ? `${staff.first_name || ""} ${staff.last_name || ""}`.trim() || staff.email || "Not recorded" : "Not recorded";

  useEffect(() => {
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current.showModal();
    return () => {
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let objectUrl = "";
    const controller = new AbortController();
    setResolvedPhotoUrl("");
    setPhotoLoadFailed(false);
    if (photoPath) {
      getParcelRegistrationPhoto(photoPath, { signal: controller.signal }).then(({ blob }) => {
        objectUrl = URL.createObjectURL(blob);
        if (mounted) setResolvedPhotoUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      }).catch(() => { if (mounted) setPhotoLoadFailed(true); });
    }
    return () => { mounted = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photoPath]);

  return (
    <dialog ref={dialogRef} className="parcel-management-modal parcel-details-modal parcel-details-dialog" aria-labelledby="parcel-detail-title" onCancel={onClose}>
      <header>
        <div><h2 id="parcel-detail-title">Parcel details</h2><p>{parcel.tracking_number}</p></div>
        <button type="button" onClick={onClose} aria-label="Close details"><X size={19} /></button>
      </header>
      <div className="parcel-management-details-grid">
        <div className={`parcel-photo-preview ${!photoPath || photoLoadFailed ? "empty" : ""}`}>
          {!photoPath ? <span><Package size={24} /> No photo uploaded</span>
            : photoLoadFailed ? <span><Package size={24} /> Photo unavailable</span>
              : !resolvedPhotoUrl ? <span><Package size={24} /> Loading photo...</span>
                : <img src={resolvedPhotoUrl} alt="Parcel" onError={() => setPhotoLoadFailed(true)} />}
        </div>
        <div className="parcel-detail-list">
          <DetailRow label="Status" value={<em className={`parcel-status-badge ${statusClass}`}>{statusText}</em>} />
          <DetailRow label="Parcel Room" value={parcelRoomLabel(parcel)} />
          <DetailRow label="Unit" value={parcel.unit?.full_unit_code || parcel.unit_full_code || "Not recorded"} />
          <DetailRow label="Courier" value={`${parcel.courier?.courier_code || parcel.courier_code || ""}${parcel.courier?.courier_code || parcel.courier_code ? " - " : ""}${parcel.courier?.courier_name || parcel.courier_name || "Not recorded"}`} />
          {!resident && <DetailRow label="Registered by" value={`${staffName}${staff?.email ? ` (${staff.email})` : ""}`} />}
          {!resident && <DetailRow label="Delivery contact" value={parcel.delivery_person_contact || "Not recorded"} />}
          <DetailRow label="Registered date" value={dateTime(parcel.created_at)} />
          <DetailRow label="Collection deadline" value={dateTime(parcel.collection_deadline)} />
          {parcel.collected_at && <DetailRow label="Collected at" value={dateTime(parcel.collected_at)} />}
        </div>
      </div>
    </dialog>
  );
}

import { Check, Power, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "./Spinner.jsx";
import { createParcelRoom, setParcelRoomStatus, updateParcelRoom } from "../services/api.js";
import { validateRoomForm } from "../utils/parcelRooms.js";

export function ParcelRoomDialog({ mode, room, onClose, onSaved, onForbidden }) {
  const dialogRef = useRef(null);
  const submitting = useRef(false);
  const [name, setName] = useState(room?.name || "");
  const [description, setDescription] = useState(room?.description || "");
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const isDeactivation = mode === "deactivate";
  const isCreate = mode === "create";
  const title = isDeactivation ? "Deactivate parcel room?" : isCreate ? "Add Parcel Room" : "Edit Parcel Room";

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
      else document.querySelector(".parcel-rooms-heading button")?.focus();
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    if (!isDeactivation) {
      const validation = validateRoomForm({ name, description });
      setErrors(validation.errors);
      if (Object.keys(validation.errors).length) {
        dialogRef.current.querySelector(validation.errors.name ? "#parcel-room-name" : "#parcel-room-description").focus();
        return;
      }
    }
    submitting.current = true;
    setIsSaving(true);
    try {
      const input = validateRoomForm({ name, description }).input;
      const result = isDeactivation
        ? await setParcelRoomStatus(room.id, false)
        : isCreate ? await createParcelRoom(input) : await updateParcelRoom(room.id, input);
      onSaved(result.parcel_room, isDeactivation ? "Parcel room deactivated." : isCreate ? "Parcel room created." : "Parcel room updated.");
    } catch (requestError) {
      if (requestError.status === 403) { onForbidden(requestError.message); return; }
      if (requestError.status === 409) {
        setErrors({ name: requestError.message });
        dialogRef.current.querySelector("#parcel-room-name")?.focus();
      } else setError(requestError.message);
    } finally {
      submitting.current = false;
      setIsSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="account-modal parcel-room-dialog" aria-labelledby="parcel-room-dialog-title"
      onCancel={(event) => { event.preventDefault(); if (!submitting.current) onClose(); }}>
      <form onSubmit={handleSubmit} noValidate>
        <header className="account-modal-heading">
          <div><h2 id="parcel-room-dialog-title">{title}</h2></div>
          <button className="icon-only-button" type="button" title="Close" aria-label="Close parcel room dialog" onClick={onClose} disabled={isSaving}><X size={18} /></button>
        </header>
        {isDeactivation ? (
          <div className="parcel-room-dialog-body">
            <strong>{room.name}</strong>
            <p>Inactive rooms cannot be selected for new parcel registrations. Existing parcel assignments will be preserved.</p>
          </div>
        ) : (
          <div className="account-modal-grid">
            <label className="account-modal-field wide" htmlFor="parcel-room-name">
              <span>Room Name <em>*</em></span>
              <input id="parcel-room-name" value={name} autoFocus required disabled={isSaving} placeholder="e.g. Lobby Parcel Room"
                aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "parcel-room-name-error" : undefined}
                onChange={(event) => { setName(event.target.value); setErrors((current) => ({ ...current, name: "" })); }} />
              {errors.name && <p className="parcel-room-field-error" id="parcel-room-name-error" role="alert">{errors.name}</p>}
            </label>
            <label className="account-modal-field wide" htmlFor="parcel-room-description">
              <span>Description <small>(optional)</small></span>
              <textarea id="parcel-room-description" value={description} rows={4} disabled={isSaving} placeholder="Location or other room details"
                aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "parcel-room-description-error" : undefined}
                onChange={(event) => { setDescription(event.target.value); setErrors((current) => ({ ...current, description: "" })); }} />
              {errors.description && <p className="parcel-room-field-error" id="parcel-room-description-error" role="alert">{errors.description}</p>}
            </label>
          </div>
        )}
        {error && <p className="parcel-room-request-error" role="alert">{error}</p>}
        <footer className="modal-footer-actions end">
          <button className="secondary-button" type="button" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button className={isDeactivation ? "danger-confirm-button" : "dark-action-button"} type="submit" disabled={isSaving}>
            {isSaving ? <Spinner label="Saving" /> : <>{isDeactivation ? <Power size={16} /> : <Check size={16} />}{isDeactivation ? "Deactivate Room" : isCreate ? "Create Room" : "Save Changes"}</>}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

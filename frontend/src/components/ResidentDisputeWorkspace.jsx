import {
  AlertCircle,
  Edit3,
  MessageSquare,
  Send,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "../context/AuthContext.jsx";
import {
  deleteResidentDispute,
  getDisputeMessages,
  sendDisputeMessage,
  updateResidentDispute
} from "../services/api.js";
import { navigate } from "../utils/navigation.js";
import { DISPUTE_ISSUE_TYPES, formatMalaysiaDate } from "../utils/disputes.js";
import { Spinner } from "./Spinner.jsx";

const MAX_FILES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_DESCRIPTION = 4000;
const MAX_MESSAGE = 2000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);

function fileIdentity(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function validateFiles(fileList, currentCount) {
  const files = Array.from(fileList || []);
  if (currentCount + files.length > MAX_FILES) {
    return { error: "A dispute can include a maximum of 3 evidence images." };
  }

  for (const file of files) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const validExtension = file.type === "image/jpeg"
      ? ["jpg", "jpeg"].includes(extension)
      : extension === "png";
    if (!ALLOWED_TYPES.has(file.type) || !validExtension) {
      return { error: "Evidence must be a JPG, JPEG, or PNG image." };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { error: `${file.name} is larger than 5 MB.` };
    }
  }

  return { files };
}

function EditDisputeModal({ dispute, evidenceImages, onClose, onUpdated }) {
  const inputRef = useRef(null);
  const [issueType, setIssueType] = useState(dispute.issue_type);
  const [description, setDescription] = useState(dispute.description);
  const [keptEvidenceIds, setKeptEvidenceIds] = useState(
    evidenceImages.map((item) => item.evidence_id)
  );
  const [newEvidence, setNewEvidence] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const next = newEvidence.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => next.forEach((item) => URL.revokeObjectURL(item.url));
  }, [newEvidence]);

  const trimmedDescription = description.trim();
  const canSave = issueType
    && trimmedDescription.length >= 10
    && trimmedDescription.length <= MAX_DESCRIPTION
    && !isSaving;

  function addFiles(fileList) {
    const result = validateFiles(fileList, keptEvidenceIds.length + newEvidence.length);
    if (result.error) {
      setError(result.error);
      return;
    }

    const existing = new Set(newEvidence.map(fileIdentity));
    setNewEvidence((current) => [
      ...current,
      ...result.files.filter((file) => !existing.has(fileIdentity(file)))
    ]);
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSave) return;
    setIsSaving(true);
    setError("");

    try {
      await updateResidentDispute({
        disputeId: dispute.dispute_id,
        issueType,
        description: trimmedDescription,
        keptEvidenceIds,
        evidence: newEvidence
      });
      await onUpdated();
      onClose();
    } catch (requestError) {
      setError(requestError.message || "Unable to update this dispute.");
      setIsSaving(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop dispute-workspace-modal-backdrop" role="presentation">
      <form className="dispute-edit-modal animate-modal" role="dialog" aria-modal="true" aria-labelledby="edit-dispute-title" onSubmit={handleSubmit}>
        <header>
          <div><h2 id="edit-dispute-title">Edit Dispute</h2><p>Only open disputes can be edited. The related parcel cannot be changed.</p></div>
          <button type="button" aria-label="Close edit dispute" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="dispute-edit-modal-body">
          {error && <div className="dispute-message error" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}

          <label className="dispute-form-field">
            <span>Related Parcel</span>
            <input value={`${dispute.parcel.tracking_number} · ${dispute.parcel.courier_name}`} disabled />
            <small>The parcel is fixed after the dispute is submitted.</small>
          </label>
          <label className="dispute-form-field">
            <span>Issue Type <b>*</b></span>
            <select value={issueType} disabled={isSaving} onChange={(event) => setIssueType(event.target.value)}>
              {DISPUTE_ISSUE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="dispute-form-field">
            <span>Description <b>*</b></span>
            <textarea value={description} maxLength={MAX_DESCRIPTION} disabled={isSaving} onChange={(event) => setDescription(event.target.value)} />
            <small className={trimmedDescription.length > 0 && trimmedDescription.length < 10 ? "invalid" : ""}>
              {trimmedDescription.length < 10 ? "Enter at least 10 characters." : "Update only information relevant to this parcel."}
              <span>{description.length} / {MAX_DESCRIPTION}</span>
            </small>
          </label>

          <div className="dispute-form-field">
            <span>Evidence</span>
            <div className="dispute-edit-evidence-grid">
              {evidenceImages.filter((item) => keptEvidenceIds.includes(item.evidence_id)).map((item) => (
                <figure key={item.evidence_id}>
                  {item.url ? <img src={item.url} alt={item.original_filename} /> : <span>Image unavailable</span>}
                  <figcaption>{item.original_filename}</figcaption>
                  <button type="button" aria-label={`Remove ${item.original_filename}`} onClick={() => setKeptEvidenceIds((current) => current.filter((id) => id !== item.evidence_id))}><X size={14} /></button>
                </figure>
              ))}
              {previews.map(({ file, url }) => (
                <figure key={fileIdentity(file)}>
                  <img src={url} alt={file.name} />
                  <figcaption>{file.name}</figcaption>
                  <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setNewEvidence((current) => current.filter((item) => fileIdentity(item) !== fileIdentity(file)))}><X size={14} /></button>
                </figure>
              ))}
            </div>
            <button className="dispute-evidence-add-button" type="button" disabled={keptEvidenceIds.length + newEvidence.length >= MAX_FILES || isSaving} onClick={() => inputRef.current?.click()}>
              <Upload size={16} /> Add evidence ({keptEvidenceIds.length + newEvidence.length}/{MAX_FILES})
            </button>
            <input ref={inputRef} className="dispute-hidden-file-input" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
          </div>
        </div>
        <footer>
          <button className="dispute-secondary-button" type="button" disabled={isSaving} onClick={onClose}>Cancel</button>
          <button className="dispute-primary-button" type="submit" disabled={!canSave}>{isSaving ? <Spinner label="Saving..." /> : "Save Changes"}</button>
        </footer>
      </form>
    </div>,
    document.body
  );
}

function DeleteDisputeModal({ dispute, onClose }) {
  const [error, setError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  async function confirmDelete() {
    setIsDeleting(true);
    setError("");
    try {
      await deleteResidentDispute(dispute.dispute_id);
      navigate("/disputes");
    } catch (requestError) {
      setError(requestError.message || "Unable to delete this dispute.");
      setIsDeleting(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop dispute-workspace-modal-backdrop" role="presentation">
      <section className="dispute-delete-modal animate-modal" role="dialog" aria-modal="true" aria-labelledby="delete-dispute-title">
        <span><Trash2 size={24} /></span>
        <h2 id="delete-dispute-title">Delete this dispute?</h2>
        <p>{dispute.dispute_reference} will be removed from your dispute history. This action is available only while it is open.</p>
        {error && <div className="dispute-message error" role="alert">{error}</div>}
        <div>
          <button className="dispute-secondary-button" type="button" disabled={isDeleting} onClick={onClose}>Cancel</button>
          <button className="dispute-danger-button" type="button" disabled={isDeleting} onClick={confirmDelete}>{isDeleting ? "Deleting..." : "Delete Dispute"}</button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function DisputeConversation({ disputeId, resolved }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getDisputeMessages(disputeId)
      .then((data) => { if (!cancelled) setMessages(data.messages || []); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message || "Unable to load conversation."); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [disputeId]);

  const trimmedDraft = draft.trim();

  async function submitMessage(event) {
    event.preventDefault();
    if (!trimmedDraft || trimmedDraft.length > MAX_MESSAGE || isSending || resolved) return;
    setIsSending(true);
    setError("");
    try {
      const data = await sendDisputeMessage(disputeId, trimmedDraft);
      setMessages((current) => current.some((item) => item.message_id === data.dispute_message.message_id)
        ? current
        : [...current, data.dispute_message]);
      setDraft("");
    } catch (requestError) {
      setError(requestError.message || "Unable to send this message.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="resident-dispute-conversation">
      <div className="resident-dispute-section-heading">
        <h2><MessageSquare size={17} /> Conversation</h2>
        {resolved && <span>Read-only</span>}
      </div>
      {isLoading ? <div className="dispute-conversation-loading"><Spinner label="Loading messages..." /></div> : messages.length === 0 ? (
        <p className="resident-dispute-muted">No messages yet. Staff replies will appear here.</p>
      ) : (
        <ol className="dispute-conversation-list">
          {messages.map((item) => {
            const own = item.sender.user_id === user?.user_id;
            return (
              <li className={own ? "own" : "staff"} key={item.message_id}>
                <div><strong>{own ? "You" : item.sender.name || item.sender.role}</strong><time>{formatMalaysiaDate(item.created_at, { hour: "2-digit", minute: "2-digit" })}</time></div>
                <p>{item.message}</p>
              </li>
            );
          })}
        </ol>
      )}
      {error && <div className="dispute-message error" role="alert"><AlertCircle size={16} /><span>{error}</span></div>}
      {resolved ? (
        <p className="dispute-conversation-readonly">This conversation was closed when the dispute was resolved.</p>
      ) : (
        <form className="dispute-conversation-form" onSubmit={submitMessage}>
          <textarea value={draft} maxLength={MAX_MESSAGE} rows={3} placeholder="Write a message to the staff handling this dispute..." disabled={isSending} onChange={(event) => setDraft(event.target.value)} />
          <div><small>{draft.length} / {MAX_MESSAGE}</small><button type="submit" disabled={!trimmedDraft || isSending}><Send size={15} /> {isSending ? "Sending..." : "Send"}</button></div>
        </form>
      )}
    </section>
  );
}

export function ResidentDisputeWorkspace({ dispute, evidenceImages, onReload }) {
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const editable = dispute.status === "OPEN";
  const resolved = dispute.status === "RESOLVED";
  const actionLabel = useMemo(() => editable ? "This open dispute can still be edited or deleted." : "Editing is locked after staff review begins.", [editable]);

  return (
    <>
      <section className="resident-dispute-workspace-actions">
        <span>{actionLabel}</span>
        {editable && <div><button className="dispute-secondary-button" type="button" onClick={() => setShowEdit(true)}><Edit3 size={15} /> Edit</button><button className="dispute-delete-button" type="button" onClick={() => setShowDelete(true)}><Trash2 size={15} /> Delete</button></div>}
      </section>
      <DisputeConversation disputeId={dispute.dispute_id} resolved={resolved} />
      {showEdit && <EditDisputeModal dispute={dispute} evidenceImages={evidenceImages} onClose={() => setShowEdit(false)} onUpdated={onReload} />}
      {showDelete && <DeleteDisputeModal dispute={dispute} onClose={() => setShowDelete(false)} />}
    </>
  );
}

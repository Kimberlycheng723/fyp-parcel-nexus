import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileImage,
  MessageSquare,
  Send,
  ShieldCheck,
  UserCheck,
  X
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "../context/AuthContext.jsx";
import {
  getDispute,
  getDisputeEvidence,
  getDisputeHistory,
  getDisputeMessages,
  sendDisputeMessage,
  transitionDispute,
  updateAdminDisputeNotes,
  updateGuardDisputeResponse
} from "../services/api.js";
import {
  disputeIssueLabel,
  disputeStatusLabel,
  formatMalaysiaDate
} from "../utils/disputes.js";
import { Spinner } from "./Spinner.jsx";

const MAX_MESSAGE = 2000;
const MAX_STAFF_NOTE = 4000;

function transitionOptions(role, dispute, userId) {
  const assignedToMe = dispute?.assigned_handler?.user_id === userId;

  if (role === "GUARD") {
    if (dispute.status === "OPEN") {
      return [{ status: "IN_REVIEW_GUARD", label: "Take Dispute", icon: UserCheck }];
    }
    if (dispute.status === "IN_REVIEW_GUARD" && assignedToMe) {
      return [
        { status: "ESCALATED", label: "Escalate", tone: "warning" },
        { status: "RESOLVED", label: "Resolve", icon: CheckCircle2 }
      ];
    }
  }

  if (role === "ADMIN") {
    if (["OPEN", "ESCALATED"].includes(dispute.status)) {
      return [
        { status: "IN_REVIEW_ADMIN", label: "Take Dispute", icon: UserCheck },
        { status: "RESOLVED", label: "Resolve Directly", icon: CheckCircle2 }
      ];
    }
    if (dispute.status === "IN_REVIEW_ADMIN" && assignedToMe) {
      return [{ status: "RESOLVED", label: "Resolve", icon: CheckCircle2 }];
    }
  }

  return [];
}

function StaffConversation({ dispute, onActivity }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const resolved = dispute.status === "RESOLVED";

  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await getDisputeMessages(dispute.dispute_id, { limit: 100 });
      setMessages(data.messages || []);
    } catch (requestError) {
      setError(requestError.message || "Unable to load the conversation.");
    } finally {
      setIsLoading(false);
    }
  }, [dispute.dispute_id]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  async function submitMessage(event) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || message.length > MAX_MESSAGE || resolved || isSending) return;

    setIsSending(true);
    setError("");
    try {
      const data = await sendDisputeMessage(dispute.dispute_id, message);
      setMessages((current) => current.some((item) => item.message_id === data.dispute_message.message_id)
        ? current
        : [...current, data.dispute_message]);
      setDraft("");
      onActivity?.();
    } catch (requestError) {
      setError(requestError.message || "Unable to send this message.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="staff-dispute-section staff-dispute-conversation">
      <div className="staff-dispute-section-title">
        <h3><MessageSquare size={16} /> Conversation</h3>
        {resolved && <span>Read-only</span>}
      </div>

      {isLoading ? (
        <div className="staff-conversation-loading"><Spinner label="Loading messages..." /></div>
      ) : messages.length === 0 ? (
        <p className="staff-dispute-empty-copy">No messages yet.</p>
      ) : (
        <ol className="staff-conversation-list">
          {messages.map((item) => {
            const own = item.sender.user_id === user?.user_id;
            return (
              <li className={own ? "own" : item.sender.role === "RESIDENT" ? "resident" : "staff"} key={item.message_id}>
                <div>
                  <strong>{own ? "You" : item.sender.name || item.sender.role}</strong>
                  <time>{formatMalaysiaDate(item.created_at, { hour: "2-digit", minute: "2-digit" })}</time>
                </div>
                <p>{item.message}</p>
              </li>
            );
          })}
        </ol>
      )}

      {error && <div className="dispute-message error" role="alert"><AlertCircle size={16} /> {error}</div>}
      {resolved ? (
        <p className="staff-conversation-readonly">Conversation closed when the dispute was resolved.</p>
      ) : (
        <form className="staff-conversation-form" onSubmit={submitMessage}>
          <textarea
            rows={3}
            maxLength={MAX_MESSAGE}
            value={draft}
            disabled={isSending}
            placeholder="Reply to this dispute..."
            onChange={(event) => setDraft(event.target.value)}
          />
          <div>
            <small>{draft.length} / {MAX_MESSAGE}</small>
            <button type="submit" disabled={!draft.trim() || isSending}>
              <Send size={15} /> {isSending ? "Sending..." : "Send Reply"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export function StaffDisputeDetailModal({ disputeId, onClose, onChanged }) {
  const { user } = useAuth();
  const objectUrlsRef = useRef([]);
  const [dispute, setDispute] = useState(null);
  const [history, setHistory] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [guardResponse, setGuardResponse] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const clearObjectUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }, []);

  const loadDetail = useCallback(async () => {
    setIsLoading(true);
    setError("");
    clearObjectUrls();
    try {
      const [detailData, historyData] = await Promise.all([
        getDispute(disputeId),
        getDisputeHistory(disputeId)
      ]);
      const nextDispute = detailData.dispute;
      const loadedEvidence = await Promise.all((nextDispute.evidence || []).map(async (item) => {
        try {
          const result = await getDisputeEvidence(disputeId, item.evidence_id);
          const url = URL.createObjectURL(result.blob);
          objectUrlsRef.current.push(url);
          return { ...item, url };
        } catch {
          return { ...item, url: "", unavailable: true };
        }
      }));
      setDispute(nextDispute);
      setHistory(historyData.history || []);
      setEvidence(loadedEvidence);
      setGuardResponse(nextDispute.guard_response || "");
      setAdminNotes(nextDispute.admin_resolution_notes || "");
    } catch (requestError) {
      setError(requestError.message || "Unable to load this dispute.");
    } finally {
      setIsLoading(false);
    }
  }, [clearObjectUrls, disputeId]);

  useEffect(() => {
    void loadDetail();
    return clearObjectUrls;
  }, [clearObjectUrls, loadDetail]);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function performTransition(targetStatus) {
    if (isSaving) return;
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      const data = await transitionDispute(disputeId, targetStatus);
      setSuccess(data.message || "Dispute updated.");
      await loadDetail();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message || "Unable to update dispute status.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveStaffNotes() {
    if (isSaving) return;
    const isGuard = user.role === "GUARD";
    const value = (isGuard ? guardResponse : adminNotes).trim();
    if (!value) {
      setError(isGuard ? "Guard response is required." : "Admin resolution notes are required.");
      return;
    }

    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      const data = isGuard
        ? await updateGuardDisputeResponse(disputeId, value)
        : await updateAdminDisputeNotes(disputeId, value);
      setSuccess(data.message || "Notes saved.");
      await loadDetail();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message || "Unable to save the response.");
    } finally {
      setIsSaving(false);
    }
  }

  const options = dispute ? transitionOptions(user.role, dispute, user.user_id) : [];
  const assignedToMe = dispute?.assigned_handler?.user_id === user.user_id;
  const canEditGuardResponse = user.role === "GUARD"
    && dispute?.status === "IN_REVIEW_GUARD"
    && assignedToMe;
  const canEditAdminNotes = user.role === "ADMIN" && (
    (dispute?.status === "IN_REVIEW_ADMIN" && assignedToMe)
    || (dispute?.status === "RESOLVED" && dispute?.resolved_by?.user_id === user.user_id)
  );

  return createPortal(
    <div className="modal-backdrop staff-dispute-modal-backdrop" role="presentation">
      <section className="staff-dispute-modal animate-modal" role="dialog" aria-modal="true" aria-labelledby="staff-dispute-title">
        <header className="staff-dispute-modal-header">
          <div>
            <span>{dispute?.dispute_reference || "DISPUTE"}</span>
            <h2 id="staff-dispute-title">{dispute ? disputeIssueLabel(dispute.issue_type) : "Dispute Details"}</h2>
            {dispute && <p>Raised {formatMalaysiaDate(dispute.created_at, { hour: "2-digit", minute: "2-digit" })} · Unit {dispute.resident?.unit_full_code}</p>}
          </div>
          <button type="button" aria-label="Close dispute details" onClick={onClose}><X size={19} /></button>
        </header>

        {isLoading ? (
          <div className="staff-dispute-modal-state"><Spinner label="Loading dispute..." /></div>
        ) : error && !dispute ? (
          <div className="staff-dispute-modal-state error"><AlertCircle size={24} /><strong>Unable to open dispute</strong><span>{error}</span></div>
        ) : dispute ? (
          <>
            <div className="staff-dispute-status-strip">
              <span className={`dispute-status status-${dispute.status.toLowerCase()}`}>{disputeStatusLabel(dispute.status)}</span>
              <span><UserCheck size={15} /> Currently Handling: <strong>{dispute.assigned_handler?.name || "Unassigned"}</strong></span>
              <span><Clock3 size={15} /> Latest activity {formatMalaysiaDate(dispute.latest_activity_at, { hour: "2-digit", minute: "2-digit" })}</span>
            </div>

            <div className="staff-dispute-modal-body">
              {(error || success) && <div className={`dispute-message ${error ? "error" : "success"}`} role={error ? "alert" : "status"}>{error || success}</div>}

              <div className="staff-dispute-detail-columns">
                <main>
                  <section className="staff-dispute-section">
                    <h3>Issue Description</h3>
                    <p className="staff-dispute-description">{dispute.description}</p>
                  </section>

                  <section className="staff-dispute-section">
                    <div className="staff-dispute-section-title"><h3>Evidence</h3><span>{evidence.length} {evidence.length === 1 ? "photo" : "photos"}</span></div>
                    {evidence.length === 0 ? <p className="staff-dispute-empty-copy">No evidence was submitted.</p> : (
                      <div className="staff-dispute-evidence-grid">
                        {evidence.map((item) => (
                          <figure key={item.evidence_id}>
                            {item.url ? <a href={item.url} target="_blank" rel="noreferrer"><img src={item.url} alt={item.original_filename} /></a> : <span><FileImage size={22} /> Image unavailable</span>}
                            <figcaption title={item.original_filename}>{item.original_filename}</figcaption>
                          </figure>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="staff-dispute-section">
                    <h3>Related Parcel</h3>
                    <dl className="staff-dispute-parcel-details">
                      <div><dt>Tracking Number</dt><dd>{dispute.parcel.tracking_number}</dd></div>
                      <div><dt>Courier</dt><dd>{dispute.parcel.courier_name}</dd></div>
                      <div><dt>Resident Unit</dt><dd>{dispute.resident?.unit_full_code}</dd></div>
                      <div><dt>Parcel Status</dt><dd>{dispute.parcel.status === "COLLECTED" ? "Collected" : "Pending Collection"}</dd></div>
                      <div><dt>Registered</dt><dd>{formatMalaysiaDate(dispute.parcel.created_at, { hour: "2-digit", minute: "2-digit" })}</dd></div>
                      {dispute.parcel.collected_at && <div><dt>Collected</dt><dd>{formatMalaysiaDate(dispute.parcel.collected_at, { hour: "2-digit", minute: "2-digit" })}</dd></div>}
                    </dl>
                  </section>
                </main>

                <aside>
                  <section className="staff-dispute-section">
                    <h3>Guard Response</h3>
                    <textarea
                      rows={6}
                      maxLength={MAX_STAFF_NOTE}
                      value={guardResponse}
                      readOnly={!canEditGuardResponse}
                      placeholder="The assigned Guard can record their response here."
                      onChange={(event) => setGuardResponse(event.target.value)}
                    />
                    {user.role === "GUARD" && canEditGuardResponse && <button className="staff-note-save-button" type="button" disabled={isSaving || !guardResponse.trim()} onClick={saveStaffNotes}>Save Guard Response</button>}
                  </section>

                  <section className="staff-dispute-section">
                    <h3>Admin Resolution Notes</h3>
                    <textarea
                      rows={6}
                      maxLength={MAX_STAFF_NOTE}
                      value={adminNotes}
                      readOnly={!canEditAdminNotes}
                      placeholder="The responsible Admin can record resolution notes here."
                      onChange={(event) => setAdminNotes(event.target.value)}
                    />
                    {user.role === "ADMIN" && canEditAdminNotes && <button className="staff-note-save-button" type="button" disabled={isSaving || !adminNotes.trim()} onClick={saveStaffNotes}>Save Admin Notes</button>}
                  </section>

                  <section className="staff-dispute-section">
                    <h3>Timeline</h3>
                    <ol className="staff-dispute-timeline">
                      {history.map((item) => (
                        <li key={item.history_id}>
                          <span />
                          <div><strong>{disputeStatusLabel(item.new_status)}</strong><p>{item.note}</p><time>{formatMalaysiaDate(item.created_at, { hour: "2-digit", minute: "2-digit" })}</time></div>
                        </li>
                      ))}
                    </ol>
                  </section>
                </aside>
              </div>

              <StaffConversation dispute={dispute} onActivity={onChanged} />
            </div>

            <footer className="staff-dispute-modal-footer">
              <span>Status changes and responses are recorded in the dispute timeline.</span>
              <div>
                <button className="dispute-secondary-button" type="button" onClick={onClose}>Close</button>
                {options.map((option) => {
                  const Icon = option.icon || ShieldCheck;
                  return <button className={`staff-transition-button ${option.tone || ""}`} type="button" disabled={isSaving} onClick={() => performTransition(option.status)} key={option.status}><Icon size={15} /> {option.label}</button>;
                })}
              </div>
            </footer>
          </>
        ) : null}
      </section>
    </div>,
    document.body
  );
}

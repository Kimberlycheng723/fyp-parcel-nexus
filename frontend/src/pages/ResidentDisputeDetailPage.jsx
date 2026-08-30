import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  FileImage,
  Package,
  RefreshCw,
  ShieldCheck
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { ResidentDisputeWorkspace } from "../components/ResidentDisputeWorkspace.jsx";
import { Spinner } from "../components/Spinner.jsx";
import {
  getDispute,
  getDisputeEvidence,
  getDisputeHistory
} from "../services/api.js";
import { navigate } from "../utils/navigation.js";
import {
  disputeIssueLabel,
  disputeStatusLabel,
  formatMalaysiaDate
} from "../utils/disputes.js";

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  return size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.ceil(size / 1024))} KB`;
}

function statusTone(status) {
  return `status-${String(status || "open").toLowerCase()}`;
}

export function ResidentDisputeDetailPage({ disputeId }) {
  const objectUrlsRef = useRef([]);
  const [dispute, setDispute] = useState(null);
  const [history, setHistory] = useState([]);
  const [evidenceImages, setEvidenceImages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const clearObjectUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }, []);

  const loadDispute = useCallback(async () => {
    setIsLoading(true);
    setError("");
    clearObjectUrls();

    try {
      const [detailData, historyData] = await Promise.all([
        getDispute(disputeId),
        getDisputeHistory(disputeId)
      ]);
      const currentDispute = detailData.dispute;
      const evidence = currentDispute?.evidence || [];
      const loadedEvidence = await Promise.all(evidence.map(async (item) => {
        try {
          const result = await getDisputeEvidence(disputeId, item.evidence_id);
          const url = URL.createObjectURL(result.blob);
          objectUrlsRef.current.push(url);
          return { ...item, url, unavailable: false };
        } catch (requestError) {
          return { ...item, url: "", unavailable: true };
        }
      }));

      setDispute(currentDispute);
      setHistory(historyData.history || []);
      setEvidenceImages(loadedEvidence);
    } catch (requestError) {
      setError(requestError.status === 404
        ? "This dispute was not found or does not belong to your account."
        : requestError.message || "Unable to load this dispute.");
    } finally {
      setIsLoading(false);
    }
  }, [clearObjectUrls, disputeId]);

  useEffect(() => {
    void loadDispute();
    return clearObjectUrls;
  }, [clearObjectUrls, loadDispute]);

  return (
    <ProtectedLayout>
      <section className="resident-dispute-detail-page animate-rise">
        <button className="dispute-back-button" type="button" onClick={() => navigate("/disputes")}>
          <ArrowLeft size={17} /> Back to My Disputes
        </button>

        {isLoading ? (
          <div className="disputes-state"><Spinner label="Loading dispute..." /></div>
        ) : error ? (
          <div className="disputes-state empty">
            <AlertCircle size={25} />
            <strong>Unable to open dispute</strong>
            <span>{error}</span>
            <button className="dispute-secondary-button" type="button" onClick={loadDispute}><RefreshCw size={15} /> Retry</button>
          </div>
        ) : dispute ? (
          <>
            <header className="resident-dispute-detail-header">
              <div>
                <span>ACCOUNT / DISPUTES / {dispute.dispute_reference}</span>
                <div className="resident-dispute-title-line">
                  <h1>{disputeIssueLabel(dispute.issue_type)}</h1>
                  <span className={`dispute-status ${statusTone(dispute.status)}`}>{disputeStatusLabel(dispute.status)}</span>
                </div>
                <p>Raised {formatMalaysiaDate(dispute.created_at, { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <strong>{dispute.dispute_reference}</strong>
            </header>

            <div className="resident-dispute-detail-grid">
              <main className="resident-dispute-detail-panel">
                <section className="resident-dispute-section">
                  <h2>Issue Description</h2>
                  <p className="resident-dispute-description">{dispute.description}</p>
                </section>

                <section className="resident-dispute-section">
                  <div className="resident-dispute-section-heading">
                    <h2>Uploaded Evidence</h2>
                    <span>{evidenceImages.length} {evidenceImages.length === 1 ? "photo" : "photos"}</span>
                  </div>
                  {evidenceImages.length === 0 ? (
                    <p className="resident-dispute-muted">No evidence photos were submitted.</p>
                  ) : (
                    <div className="resident-dispute-evidence-grid">
                      {evidenceImages.map((image) => (
                        <figure key={image.evidence_id}>
                          {image.unavailable ? (
                            <span className="resident-evidence-unavailable"><FileImage size={24} /> Image unavailable</span>
                          ) : (
                            <a href={image.url} target="_blank" rel="noreferrer" aria-label={`Open ${image.original_filename}`}>
                              <img src={image.url} alt={`Evidence ${image.original_filename}`} />
                            </a>
                          )}
                          <figcaption><span title={image.original_filename}>{image.original_filename}</span><small>{formatFileSize(image.file_size)}</small></figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                </section>

                <section className="resident-dispute-section">
                  <h2>Related Parcel</h2>
                  <dl className="resident-related-parcel">
                    <div><dt>Tracking</dt><dd>{dispute.parcel.tracking_number}</dd></div>
                    <div><dt>Courier</dt><dd>{dispute.parcel.courier_name}</dd></div>
                    <div><dt>Unit</dt><dd>{dispute.parcel.unit_full_code}</dd></div>
                    <div><dt>Registered</dt><dd>{formatMalaysiaDate(dispute.parcel.created_at, { hour: "2-digit", minute: "2-digit" })}</dd></div>
                    <div><dt>Parcel Status</dt><dd>{dispute.parcel.status === "COLLECTED" ? "Collected" : "Pending Collection"}</dd></div>
                    {dispute.parcel.collected_at && <div><dt>Collected</dt><dd>{formatMalaysiaDate(dispute.parcel.collected_at, { hour: "2-digit", minute: "2-digit" })}</dd></div>}
                  </dl>
                </section>
              </main>

              <aside className="resident-dispute-status-panel">
                <section>
                  <h2>Current Status</h2>
                  <div className={`resident-current-status ${statusTone(dispute.status)}`}>
                    {dispute.status === "RESOLVED" ? <CheckCircle2 size={20} /> : <CalendarClock size={20} />}
                    <div><strong>{disputeStatusLabel(dispute.status)}</strong><span>Last updated {formatMalaysiaDate(dispute.updated_at, { hour: "2-digit", minute: "2-digit" })}</span></div>
                  </div>
                </section>

                {dispute.guard_response && (
                  <section>
                    <h2>Guard Response</h2>
                    <p className="resident-staff-response"><ShieldCheck size={17} /> <span>{dispute.guard_response}</span></p>
                  </section>
                )}

                {dispute.admin_resolution_notes && (
                  <section>
                    <h2>Admin Resolution Notes</h2>
                    <p className="resident-staff-response"><ShieldCheck size={17} /> <span>{dispute.admin_resolution_notes}</span></p>
                  </section>
                )}

                <section>
                  <h2>Dispute Timeline</h2>
                  <ol className="resident-dispute-timeline">
                    {history.map((event) => (
                      <li key={event.history_id}>
                        <span />
                        <div>
                          <strong>{disputeStatusLabel(event.new_status)}</strong>
                          <p>{event.note}</p>
                          <time dateTime={event.created_at}>{formatMalaysiaDate(event.created_at, { hour: "2-digit", minute: "2-digit" })}</time>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>

                <div className="resident-dispute-readonly-note">
                  <Package size={17} /> Status and staff responses are read-only for Residents.
                </div>
              </aside>
            </div>
            <ResidentDisputeWorkspace
              dispute={dispute}
              evidenceImages={evidenceImages}
              onReload={loadDispute}
            />
          </>
        ) : null}
      </section>
    </ProtectedLayout>
  );
}

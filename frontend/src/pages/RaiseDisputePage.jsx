import { AlertCircle, ImagePlus, Info, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import {
  createResidentDispute,
  getEligibleDisputeParcels
} from "../services/api.js";
import { navigate } from "../utils/navigation.js";
import { DISPUTE_ISSUE_TYPES, formatMalaysiaDate } from "../utils/disputes.js";

const MAX_EVIDENCE_FILES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_DESCRIPTION_LENGTH = 4000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);

function fileIdentity(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

async function loadAllEligibleParcels() {
  const firstPage = await getEligibleDisputeParcels({ page: 1, limit: 100 });
  const pages = Number(firstPage.pagination?.total_pages || 1);

  if (pages <= 1) return firstPage.parcels || [];

  const remaining = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      getEligibleDisputeParcels({ page: index + 2, limit: 100 })
    )
  );
  return [firstPage, ...remaining].flatMap((data) => data.parcels || []);
}

export function RaiseDisputePage() {
  const inputRef = useRef(null);
  const submitTimerRef = useRef(null);
  const [parcels, setParcels] = useState([]);
  const [parcelId, setParcelId] = useState("");
  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [isLoadingParcels, setIsLoadingParcels] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    loadAllEligibleParcels()
      .then((items) => {
        if (cancelled) return;
        setParcels(items);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message || "Unable to load eligible parcels.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingParcels(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const nextPreviews = evidence.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(nextPreviews);

    return () => nextPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [evidence]);

  useEffect(() => () => window.clearTimeout(submitTimerRef.current), []);

  const selectedParcel = useMemo(
    () => parcels.find((parcel) => parcel.parcel_id === parcelId) || null,
    [parcelId, parcels]
  );
  const trimmedDescription = description.trim();
  const isValid = Boolean(
    parcelId
    && issueType
    && trimmedDescription.length >= 10
    && trimmedDescription.length <= MAX_DESCRIPTION_LENGTH
  );

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;

    setError("");
    const existingIds = new Set(evidence.map(fileIdentity));
    const accepted = [];

    for (const file of incoming) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      const hasAllowedExtension = file.type === "image/jpeg"
        ? ["jpg", "jpeg"].includes(extension)
        : extension === "png";

      if (!ALLOWED_TYPES.has(file.type) || !hasAllowedExtension) {
        setError("Evidence must be a JPG, JPEG, or PNG image.");
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name} is larger than 5 MB.`);
        continue;
      }
      if (!existingIds.has(fileIdentity(file))) {
        accepted.push(file);
        existingIds.add(fileIdentity(file));
      }
    }

    if (evidence.length + accepted.length > MAX_EVIDENCE_FILES) {
      setError("You can upload a maximum of 3 evidence images.");
      return;
    }

    setEvidence((current) => [...current, ...accepted]);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const data = await createResidentDispute({
        parcelId,
        issueType,
        description: trimmedDescription,
        evidence
      });
      setSuccess("Dispute submitted successfully. Opening its status page...");
      submitTimerRef.current = window.setTimeout(() => {
        navigate(`/disputes/${data.dispute.dispute_id}`);
      }, 650);
    } catch (requestError) {
      setError(requestError.message || "Unable to submit the dispute.");
      setIsSubmitting(false);
    }
  }

  return (
    <ProtectedLayout>
      <section className="raise-dispute-page animate-rise">
        <header className="disputes-page-header compact">
          <div>
            <span>ACCOUNT / DISPUTES / RAISE DISPUTE</span>
            <h1>Raise a Dispute</h1>
            <p>Report a parcel-related issue and our team will investigate.</p>
          </div>
        </header>

        <form className="raise-dispute-form" onSubmit={handleSubmit}>
          <header>
            <h2>Dispute Details</h2>
            <p>Provide as much detail as possible. Clear evidence helps staff review the issue.</p>
          </header>

          {error && <div className="dispute-message error" role="alert"><AlertCircle size={18} /> {error}</div>}
          {success && <div className="dispute-message success" role="status">{success}</div>}

          <label className="dispute-form-field">
            <span>Select Parcel <b>*</b></span>
            <select value={parcelId} onChange={(event) => setParcelId(event.target.value)} disabled={isLoadingParcels || isSubmitting}>
              <option value="">{isLoadingParcels ? "Loading eligible parcels..." : "Choose the parcel this dispute is about"}</option>
              {parcels.map((parcel) => (
                <option value={parcel.parcel_id} key={parcel.parcel_id}>
                  {parcel.tracking_number} · {parcel.courier_name} · {parcel.status === "COLLECTED" ? "Collected" : parcel.is_overdue ? "Overdue" : "Pending Collection"}
                </option>
              ))}
            </select>
            {selectedParcel ? (
              <small>Registered {formatMalaysiaDate(selectedParcel.created_at)} for {selectedParcel.unit_full_code}.</small>
            ) : (
              <small>Only active parcels belonging to your unit are listed.</small>
            )}
          </label>

          {!isLoadingParcels && parcels.length === 0 && (
            <div className="dispute-message info"><Info size={17} /> No eligible parcels are available for a dispute.</div>
          )}

          <label className="dispute-form-field">
            <span>Issue Type <b>*</b></span>
            <select value={issueType} onChange={(event) => setIssueType(event.target.value)} disabled={isSubmitting}>
              <option value="">Choose the type of issue</option>
              {DISPUTE_ISSUE_TYPES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
          </label>

          <label className="dispute-form-field">
            <span>Description <b>*</b></span>
            <textarea
              value={description}
              maxLength={MAX_DESCRIPTION_LENGTH}
              rows={6}
              placeholder="Describe what happened, when you noticed the issue, and any details that may help staff investigate."
              onChange={(event) => setDescription(event.target.value)}
              disabled={isSubmitting}
            />
            <small className={trimmedDescription.length > 0 && trimmedDescription.length < 10 ? "invalid" : ""}>
              {trimmedDescription.length > 0 && trimmedDescription.length < 10
                ? "Enter at least 10 characters."
                : "Include only information relevant to this parcel."}
              <span>{description.length} / {MAX_DESCRIPTION_LENGTH}</span>
            </small>
          </label>

          <div className="dispute-form-field">
            <span>Upload Evidence</span>
            <div
              className={`dispute-evidence-dropzone ${isDragging ? "dragging" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <span className="dispute-upload-icon"><Upload size={20} /></span>
              <div className="dispute-upload-prompt">
                Drag and drop or <button type="button" onClick={() => inputRef.current?.click()}>browse</button> to upload photos
              </div>
              <small>JPG, JPEG, or PNG up to 5 MB each · {evidence.length}/{MAX_EVIDENCE_FILES} uploaded</small>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                multiple
                disabled={evidence.length >= MAX_EVIDENCE_FILES || isSubmitting}
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>

            {previews.length > 0 && (
              <div className="dispute-evidence-previews">
                {previews.map(({ file, url }) => (
                  <figure key={fileIdentity(file)}>
                    <img src={url} alt={`Selected evidence ${file.name}`} />
                    <figcaption>
                      <span title={file.name}>{file.name}</span>
                      <small>{(file.size / (1024 * 1024)).toFixed(1)} MB</small>
                    </figcaption>
                    <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setEvidence((current) => current.filter((item) => fileIdentity(item) !== fileIdentity(file)))}>
                      <X size={15} />
                    </button>
                  </figure>
                ))}
              </div>
            )}
          </div>

          <div className="raise-dispute-note">
            <Info size={17} />
            <span>Disputes are reviewed by operational staff. You will receive a notification when the status changes.</span>
          </div>

          <footer className="raise-dispute-actions">
            <span><ImagePlus size={16} /> Evidence is optional.</span>
            <div>
              <button className="dispute-secondary-button" type="button" disabled={isSubmitting} onClick={() => navigate("/disputes")}>Cancel</button>
              <button className="dispute-primary-button" type="submit" disabled={!isValid || isSubmitting}>
                {isSubmitting ? <Spinner label="Submitting..." /> : "Submit Dispute"}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </ProtectedLayout>
  );
}

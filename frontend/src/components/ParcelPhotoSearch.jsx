import { ChevronDown, ChevronLeft, ChevronRight, ImagePlus, Search, Square, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useParcelPhotoSearch } from '../hooks/useParcelPhotoSearch.js';
import { usePhotoSearchReference } from '../hooks/usePhotoSearchReference.js';
import { FULL_REGION } from '../utils/photoAnalysisPolicy.js';
import { traceDay } from '../utils/parcelTrace.js';
import { EvidencePhoto, ParcelTraceEvidence } from './ParcelTraceEvidence.jsx';
import { rankVisualCandidates } from '../utils/visualSimilarity.js';
import { SimilarityBadge, SimilarityBreakdown } from './VisualSimilarity.jsx';
import { Spinner } from './Spinner.jsx';
import { photoSearchProgress } from '../utils/photoSearchProgress.js';
import { photoMatchSummary } from '../utils/photoMatchSummary.js';

const SEARCH_OPTIONS = Object.freeze({ parcelRegion: FULL_REGION, labelRegion: FULL_REGION, grabCut: false, regionSelected: false });
const photoKey = (item) => `${item.evidence.photo_source || 'COLLECTION'}:${item.evidence.evidence_id}`;

export function ParcelPhotoSearch({ parcel, disputeId, onSelect, onReferenceChange, selected, referencePhoto }) {
  const { user } = useAuth();
  const [filters, setFilters] = useState({ from: traceDay(parcel.created_at), to: traceDay(Date.now()), status: '', photo_source: 'ALL', dispute_id: disputeId });
  const [batchSize, setBatchSize] = useState(10), [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const manualSelection = useRef(false);
  const search = useParcelPhotoSearch({ parcelId: parcel.parcel_id, tracking: parcel.tracking_number, role: user?.role });
  const reference = usePhotoSearchReference({ parcelId: parcel.parcel_id, disputeId, available: parcel.registration_photo_present, role: user?.role });
  const uploadInput = useRef(null);
  const previousReference = useRef(null);
  const busy = ['RUNNING', 'CANCELLING'].includes(search.phase);
  const progress = photoSearchProgress(search);
  const referenceBusy = reference.phase === 'LOADING' || reference.validating;
  const referenceReady = Boolean(reference.photo) && !referenceBusy;
  const results = useMemo(() => rankVisualCandidates(search.results), [search.results]);
  useEffect(() => {
    if (!search.results.length) { manualSelection.current = false; setSelectedId(null); onSelect(null); return; }
    if (busy) return;
    const selected = (manualSelection.current && results.find((item) => photoKey(item) === selectedId)) || results[0];
    if (selected) { setSelectedId(photoKey(selected)); onSelect(selected); } else onSelect(null);
  }, [search.results, results, busy, selectedId, onSelect]);
  useEffect(() => { onReferenceChange?.(reference.photo?.source === 'UPLOAD' ? reference.photo : null); }, [reference.photo, onReferenceChange]);
  useEffect(() => {
    if (previousReference.current && previousReference.current !== reference.photo) resetReferenceSearch();
    previousReference.current = reference.photo;
  }, [reference.photo]);
  if (!['ADMIN', 'GUARD'].includes(user?.role)) return null;
  function updateFilter(key, value) { search.reset(); onSelect(null); setSelectedId(null); setFilters((current) => ({ ...current, [key]: value })); setPage(1); }
  function start(event) {
    event.preventDefault();
    if (busy) { search.cancel(); return; }
    if (!referenceReady) return;
    if (search.canContinue) { void search.continueSearch(); return; }
    setPage(1);
    void search.start(filters, batchSize, SEARCH_OPTIONS, reference.photo);
  }
  function resetReferenceSearch() { search.reset(); setPage(1); onSelect(null); }
  async function uploadReference(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || busy) return;
    if (await reference.upload(file)) resetReferenceSearch();
  }
  function compare(item) {
    manualSelection.current = true;
    setPage(1); setSelectedId(photoKey(item)); onSelect(item); document.getElementById('trace-evidence-title')?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }
  const samePhoto = (left, right) => left?.evidence.evidence_id === right?.evidence.evidence_id && left?.evidence.photo_source === right?.evidence.photo_source;
  const otherResults = results.filter((item) => !samePhoto(item, selected));
  const pageResults = otherResults.slice((page - 1) * 10, page * 10);
  const summary = selected ? photoMatchSummary(selected) : null;
  return <section className="trace-section parcel-photo-search" aria-labelledby="photo-search-title">
    <div className="trace-section-heading"><h2 id="photo-search-title">Image comparison</h2>{search.results.length > 0 && <button type="button" className="trace-link photo-clear-results" disabled={busy} onClick={resetReferenceSearch}><X size={14} />Clear Results</button>}</div>
    {(!referenceReady || reference.photo?.source === 'UPLOAD') && <div className="photo-search-reference" aria-label="Search reference photo" aria-busy={referenceBusy}>
      <div className="photo-reference-copy">
        <strong>{reference.validating ? 'Checking reference photo...' : reference.phase === 'LOADING' ? 'Loading registration photo...' : reference.photo?.source === 'UPLOAD' ? 'Uploaded reference photo' : referenceReady ? 'Registration photo available' : reference.phase === 'ERROR' ? 'Registration photo could not be loaded' : 'No registration photo available'}</strong>
        {reference.photo?.source === 'UPLOAD' ? <><p>{reference.photo.name}</p><p>Used only for this search; it will not change stored parcel photos.</p></>
          : !referenceReady && !referenceBusy && !reference.blocked ? <p>Upload a photo of the parcel to start a photo search.</p> : null}
      </div>
      <div className="photo-reference-actions">
        {reference.phase === 'ERROR' && <button type="button" className="secondary-button" disabled={busy || referenceBusy} onClick={() => { resetReferenceSearch(); reference.reload(); }}>Retry registration photo</button>}
        {!reference.blocked && (reference.photo?.source === 'UPLOAD' || (!referenceReady && !referenceBusy)) && <button type="button" className="secondary-button" disabled={busy || referenceBusy} onClick={() => uploadInput.current?.click()}><Upload size={15} />{reference.photo ? 'Replace Reference Photo' : 'Upload Reference Photo'}</button>}
        {reference.photo?.source === 'UPLOAD' && <button type="button" className="secondary-button" disabled={busy || referenceBusy} onClick={() => { resetReferenceSearch(); reference.reload(); }}><X size={15} /> Remove Reference Photo</button>}
      </div>
      <input ref={uploadInput} className="photo-reference-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Reference photo" onChange={uploadReference} hidden />
    </div>}
    {reference.blocked && <p className="trace-error" role="alert">You do not have access to these photos. Sign in as an Admin or Guard.</p>}
    {reference.uploadError && <p className="trace-error" role="alert">{reference.uploadError}</p>}
    <form onSubmit={start} className="photo-search-form"><fieldset disabled={busy} aria-label="Photo search filters">
      <label>Start date<input type="date" required value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} /></label>
      <label>End date<input type="date" required min={filters.from} value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} /></label>
      <label>Photo source<select aria-label="Photo source" value={filters.photo_source} onChange={(event) => updateFilter('photo_source', event.target.value)}><option value="ALL">All photos</option><option value="REGISTRATION">Registration</option><option value="COLLECTION">Collection</option></select></label>
      <label>Collection status<select aria-label="Collection status" disabled={filters.photo_source === 'REGISTRATION'} value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
        <option value="USED">Completed</option><option value="">All collections</option><option value="VERIFYING">Being checked</option><option value="CANCELLED">Cancelled</option><option value="EXPIRED">Expired request</option>
      </select></label>
      <label>Photos to check at a time<select aria-label="Photos to check at a time" value={batchSize} onChange={(event) => setBatchSize(Number(event.target.value))}><option value={10}>10</option><option value={20}>20</option></select></label>
    </fieldset>
    <div className="photo-search-actions"><button className="primary-button" type="submit" disabled={search.phase === 'CANCELLING' || (!busy && !referenceReady)}>{busy ? <Square size={14} /> : <Search size={16} />}{search.phase === 'CANCELLING' ? 'Stopping...' : busy ? 'Cancel Search' : search.canContinue ? 'Continue Search' : 'Search Similar Photos'}</button>
    </div></form>
    {progress && <div className="photo-search-progress" role="status" aria-live="polite" aria-atomic="true" data-phase={search.phase}>
      {busy ? <Spinner label={progress.label} /> : <strong>{progress.label}</strong>}
      {progress.remaining && <span className="photo-search-remaining">{progress.remaining}</span>}
    </div>}
    {search.limited && !busy && <p className="trace-error">There are too many photos for one search. Choose a shorter date range to check more.</p>}
    {search.error && <p className="trace-error" role="alert">{search.error}</p>}
    {search.done && !search.discovered && !busy && !search.error && <p className="trace-empty">No other parcel photos found for these dates. Try a wider date range or a different photo source or collection status.</p>}
    {selected && !busy && <div className="photo-selected-comparison photo-match-comparison">
      <ParcelTraceEvidence parcel={parcel} selected={selected} filters={selected.analysisFilters || { dispute_id: disputeId }} referencePhoto={referencePhoto}
        title={samePhoto(selected, results[0]) ? 'Closest match' : 'Photo comparison'} />
      <details className="photo-match-details" key={`${selected.evidence.photo_source}:${selected.evidence.evidence_id}`}>
        <summary><Search size={22} aria-hidden="true" /><span className="photo-match-lead"><strong>{summary.title}</strong><span>{summary.description}</span></span><span className="photo-match-detail-label"><span className="when-closed">View details</span><span className="when-open">Hide details</span><ChevronDown size={16} /></span></summary>
        <div className="photo-match-detail-content">
          <SimilarityBreakdown result={selected} />
        </div>
      </details>
    </div>}
    {!busy && otherResults.length > 0 && <section className="photo-other-matches" aria-labelledby="other-photo-matches">
      <h3 id="other-photo-matches">Other possible matches</h3>
      <div className="photo-match-list">{pageResults.map((item) => <article key={`${item.evidence.photo_source || 'COLLECTION'}:${item.evidence.evidence_id}`} className="photo-analysis-result photo-match-row" data-evidence-id={item.evidence.evidence_id}>
        <EvidencePhoto compact parcelId={parcel.parcel_id} evidenceId={item.evidence.evidence_id} filters={item.analysisFilters} photoSource={item.evidence.photo_source} label={`Photo for ${item.evidence.tracking_number}`} requested />
        <SimilarityBadge result={item} compact />
        <button className="trace-link" type="button" onClick={() => compare(item)} aria-label={`Compare photo ${item.evidence.tracking_number}`}><ImagePlus size={15} />Compare</button>
      </article>)}</div>
      {otherResults.length > 10 && <footer className="trace-pagination"><span>Page {page} of {Math.ceil(otherResults.length / 10)}</span><div><button type="button" title="Previous matches" aria-label="Previous matches" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /></button><button type="button" title="Next matches" aria-label="Next matches" disabled={page * 10 >= otherResults.length} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></button></div></footer>}
    </section>}
  </section>;
}

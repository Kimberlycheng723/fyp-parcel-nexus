import { ImageOff, Maximize2, RefreshCw, X, ZoomIn } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getParcelTracePhoto } from '../services/api.js';
import { traceQuery, traceTime } from '../utils/parcelTrace.js';
import { SimilarityBadge } from './VisualSimilarity.jsx';
import { photoMatchSummary } from '../utils/photoMatchSummary.js';

function EnlargedPhoto({ photo, onClose }) {
  const ref = useRef(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const focus = document.activeElement;
    ref.current.showModal();
    return () => { if (focus?.isConnected) focus.focus(); };
  }, []);
  return <dialog className="trace-photo-dialog" ref={ref} onCancel={onClose} aria-labelledby="trace-photo-title">
    <header><h2 id="trace-photo-title">{photo.label}</h2><button type="button" title="Close preview" aria-label="Close preview" onClick={onClose}><X size={20} /></button></header>
    <label className="trace-zoom"><ZoomIn size={16} /> Zoom <input type="range" min="1" max="3" step="0.25" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><span>{zoom}x</span></label>
    <div className="trace-photo-zoom"><img src={photo.url} alt={photo.label} style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} /></div>
  </dialog>;
}
export function EvidencePhoto({ parcelId, evidenceId, filters, label, requested, timestamp, referenceBlob, photoSource, compact = false, caption, badge }) {
  const [url, setUrl] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0), [enlarged, setEnlarged] = useState(false);
  const query = traceQuery(filters);
  useEffect(() => {
    const controller = new AbortController(); let blobUrl = '';
    setUrl(''); setError(''); setEnlarged(false); setLoading(requested);
    const photo = referenceBlob ? Promise.resolve({ blob: referenceBlob, contentType: referenceBlob.type }) : requested ? getParcelTracePhoto(parcelId, evidenceId, Object.fromEntries(new URLSearchParams(query)), { signal: controller.signal, photoSource }) : null;
    if (photo) photo
      .then((result) => {
        if (controller.signal.aborted) return;
        if (!/^image\/(jpeg|png|webp)(;|$)/i.test(result.contentType)) throw new Error('Image response unavailable.');
        blobUrl = URL.createObjectURL(result.blob); setUrl(blobUrl); setLoading(false);
      }).catch((failure) => {
        if (!controller.signal.aborted) { setLoading(false); setError([401, 403].includes(failure.status) ? 'You do not have access to this photo.' : 'Could not load this photo. Try again.'); }
      });
    return () => { controller.abort(); if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [parcelId, evidenceId, query, requested, retry, label, referenceBlob, photoSource]);
  if (compact) return <div className="photo-match-thumbnail">
    {url ? <img src={url} alt={label} onError={() => { setUrl(''); setError('Photo unavailable.'); }} /> : <><ImageOff size={20} aria-hidden="true" /><span>{loading ? 'Loading...' : 'No photo'}</span>{error && <button type="button" className="trace-link" aria-label={`Retry ${label}`} onClick={() => setRetry((n) => n + 1)}>Retry</button>}</>}
  </div>;
  return <figure className="trace-evidence-photo">
    <figcaption><strong>{label}</strong>{badge}</figcaption>
    <div className="trace-photo-stage">
      {url ? <button type="button" title="Enlarge photo" aria-label={`Enlarge ${label}`} onClick={() => setEnlarged(true)}><img src={url} alt={label} onError={() => { setUrl(''); setError(`${label} unavailable.`); }} /><span><Maximize2 size={15} /> Enlarge</span></button>
        : <div><ImageOff size={26} /><p>{loading ? 'Loading photo...' : error || 'Photo not loaded'}</p>{error && <button className="secondary-button" type="button" onClick={() => setRetry((n) => n + 1)}><RefreshCw size={14} /> Retry photo</button>}</div>}
    </div>
    <p className="photo-evidence-caption">{caption}{referenceBlob ? ' · Uploaded for this search' : ` · ${traceTime(timestamp)}`}</p>
    {enlarged && url && <EnlargedPhoto photo={{ url, label }} onClose={() => setEnlarged(false)} />}
  </figure>;
}
export function ParcelTraceEvidence({ parcel, selected, filters, referencePhoto, title = 'Photo comparison' }) {
  const [loadOriginal, setLoadOriginal] = useState(false);
  return <section className="trace-section" aria-labelledby="trace-evidence-title">
    <div className="trace-section-heading"><h2 id="trace-evidence-title">{title}</h2>{!referencePhoto && !selected && <button type="button" className="secondary-button" onClick={() => setLoadOriginal(true)} disabled={loadOriginal}>Load registration photo</button>}</div>
    <div className="trace-evidence-grid">
      <EvidencePhoto parcelId={parcel.parcel_id} filters={filters} label={referencePhoto ? 'Reference photo' : 'Registration photo'} requested={Boolean(referencePhoto) || loadOriginal || Boolean(selected)} timestamp={parcel.created_at} referenceBlob={referencePhoto?.blob} caption={`For ${parcel.unit_reference || 'unrecorded unit'}`} />
      <EvidencePhoto parcelId={parcel.parcel_id} evidenceId={selected?.evidence.evidence_id} filters={filters} photoSource={selected?.evidence.photo_source} label={selected?.evidence.photo_source === 'REGISTRATION' ? 'Another registration photo' : 'Collection photo'} requested={Boolean(selected)} timestamp={selected?.evidence.photo_uploaded_at} caption={selected ? photoMatchSummary(selected).caption : ''} badge={selected && <SimilarityBadge result={selected} />} />
    </div>
  </section>;
}

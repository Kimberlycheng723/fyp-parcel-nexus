import { ArrowRight, ChevronLeft, ChevronRight, CircleCheck, CircleHelp, CircleX, Images, RefreshCw, ScanLine, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ProtectedLayout } from '../components/ProtectedLayout.jsx';
import { ParcelPhotoSearch } from '../components/ParcelPhotoSearch.jsx';
import { CollectionBarcodeScanner } from '../components/CollectionBarcodeScanner.jsx';
import { Spinner } from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useParcelTraceRead } from '../hooks/useParcelTraceRead.js';
import { getParcelTrace } from '../services/api.js';
import { navigate } from '../utils/navigation.js';
import { traceLabel, traceSearchTarget, traceTime } from '../utils/parcelTrace.js';

function ReadState({ state, children }) {
  if (state.loading) return <div className="trace-state" role="status"><Spinner label="Loading records..." /></div>;
  if (state.error) return <div className="trace-state" role="alert"><p>{state.error}</p><button className="secondary-button" type="button" onClick={state.retry}><RefreshCw size={14} /> Retry</button></div>;
  return state.data ? children(state.data) : null;
}
function Pagination({ pagination, onPage, label }) {
  if (!pagination) return null;
  return <footer className="trace-pagination" aria-label={label + ' pagination'}><span>{pagination.total} records</span><div>
    <button type="button" title="Previous page" aria-label={'Previous ' + label + ' page'} disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}><ChevronLeft size={16} /></button>
    <span>Page {pagination.page} of {Math.max(1, pagination.total_pages)}</span>
    <button type="button" title="Next page" aria-label={'Next ' + label + ' page'} disabled={pagination.page >= pagination.total_pages} onClick={() => onPage(pagination.page + 1)}><ChevronRight size={16} /></button>
  </div></footer>;
}
function Status({ value }) { return <span className={'trace-status trace-status-' + String(value).toLowerCase()}>{traceLabel(value)}</span>; }
function BarcodeResult({ value }) {
  const result = { MATCHED: ['Match', 'match', CircleCheck], MISMATCHED: ['Mismatch', 'mismatch', CircleX], UNREADABLE: ['Unreadable', 'unreadable', CircleHelp] }[value] || [traceLabel(value), 'unknown', CircleHelp];
  const Icon = result[2];
  return <span className={'trace-status trace-barcode-result ' + result[1]}><Icon size={14} aria-hidden="true" />{result[0]}</span>;
}
function DisputeLink({ dispute }) {
  const path = '/disputes?dispute_id=' + encodeURIComponent(dispute.dispute_id);
  return <a className="trace-link" href={path} onClick={(event) => {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(path); }
  }}>View Dispute{dispute.dispute_reference ? ' · ' + dispute.dispute_reference : ''}<ArrowRight size={14} /></a>;
}
function TraceMethods({ method, onChange }) {
  const choices = [{ key: 'barcode', icon: ScanLine, title: 'Tracking number match', description: 'Check the tracking number scanned during collection.', action: 'Start check' },
    { key: 'photo', icon: Images, title: 'Image comparison', description: 'Look for similar photos taken during registration or collection.', action: 'Start comparison' }];
  return <section className={'trace-methods ' + (method ? 'compact' : '')} aria-label="Tracing method">
    {!method && <h2><span className="trace-step">2</span> Choose how to trace it</h2>}
    <div>{choices.map(({ key, icon: Icon, title, description, action }) => <button key={key} type="button" className={'trace-method ' + (method === key ? 'selected' : '')} aria-pressed={method === key} onClick={() => onChange(key)}>
      <span className="trace-method-icon"><Icon size={23} /></span><span className="trace-method-copy"><strong>{title}</strong><small>{description}</small></span>
      {!method && <span className="trace-method-action">{action}<ArrowRight size={15} /></span>}
    </button>)}</div>
  </section>;
}
function BarcodeTrace({ parcel, disputeId }) {
  const [page, setPage] = useState(1), [selectedId, setSelectedId] = useState(null);
  const state = useParcelTraceRead('parcels/' + parcel.parcel_id + '/barcodes', { dispute_id: disputeId, page });
  return <section className="trace-section trace-barcode-view"><h2>Tracking number check</h2>
    <ReadState state={state}>{(data) => {
      const item = data.attempts.find((attempt) => attempt.attempt_id === selectedId) || data.attempts[0];
      const differentUnit = item?.unit_reference && parcel.unit_reference && item.unit_reference !== parcel.unit_reference;
      return !item ? <p className="trace-empty">No collection scans found for this parcel or tracking number.</p> : <>
        <div className={'trace-outcome ' + (differentUnit || item.result === 'MISMATCHED' ? 'attention' : item.result === 'MATCHED' ? 'matched' : 'neutral')} role="status">
          {differentUnit || item.result === 'MISMATCHED' ? <CircleX size={28} /> : item.result === 'MATCHED' ? <CircleCheck size={28} /> : <CircleHelp size={28} />}
          <div><h3>{differentUnit ? 'Scan recorded for a different unit' : item.result === 'MATCHED' ? 'Tracking number matches' : item.result === 'MISMATCHED' ? 'Tracking numbers do not match' : 'Scan result is unclear'}</h3>
            <p>{differentUnit ? 'Registered to ' + parcel.unit_reference + '; a collection scan was recorded for ' + item.unit_reference + '.' : 'Registration and collection scan records are shown below.'}</p></div>
        </div>
        <div className="trace-unit-comparison"><div><small>REGISTERED TO</small><strong>{parcel.unit_reference || 'Not recorded'}</strong><span>{parcel.tracking_number}</span><time>{traceTime(parcel.created_at)}</time></div>
          <div><small>COLLECTION UNIT</small><strong>{item.unit_reference || 'Not recorded'}</strong><span>{item.scanned_tracking_number || 'No readable tracking number'}</span><time>{traceTime(item.created_at)}</time></div></div>
        <div className="trace-scan-outcome"><BarcodeResult value={item.result} /><span>{item.registered_tracking_number || 'Not recorded'} → {item.scanned_tracking_number || 'Not recorded'}</span></div>
        <p className="trace-evidence-caution">A barcode scan alone does not prove this parcel was handed over, even if the collection was marked complete.</p>
        <details className="trace-disclosure"><summary>View scan records</summary><div className="trace-table-wrap"><table className="trace-table trace-barcode-table"><thead><tr><th scope="col">Registered Tracking Number</th><th scope="col">Scanned Tracking Number</th><th scope="col">Collection Unit</th><th scope="col">Scan Time</th><th scope="col">Result</th></tr></thead><tbody>
          {data.attempts.map((attempt) => <tr key={attempt.attempt_id}>
            <td data-label="Registered Tracking Number"><strong>{attempt.registered_tracking_number || 'Not recorded'}</strong></td><td data-label="Scanned Tracking Number"><strong>{attempt.scanned_tracking_number || 'Not recorded'}</strong></td>
            <td data-label="Collection Unit">{attempt.unit_reference || 'Not recorded'}</td><td data-label="Scan Time"><time>{traceTime(attempt.created_at)}</time></td>
            <td data-label="Result"><BarcodeResult value={attempt.result} /><button className="trace-link" type="button" onClick={() => setSelectedId(attempt.attempt_id)}>Review scan</button><details className="trace-scan-details"><summary>Details</summary><dl>
              <div><dt>Collection status</dt><dd>{traceLabel(attempt.verification_status)}</dd></div><div><dt>Marked complete at</dt><dd>{attempt.completed_at ? traceTime(attempt.completed_at) : 'Collection not confirmed'}</dd></div>
              <div><dt>Parcel scanned</dt><dd>{attempt.target_parcel_attempt ? 'The parcel you are tracing' : 'A different parcel'}</dd></div>
              {attempt.exact_tracking_match && <div><dt>Tracking number</dt><dd>The scan contains the tracking number you are searching for.</dd></div>}
            </dl></details></td>
          </tr>)}</tbody></table></div><Pagination pagination={data.pagination} onPage={setPage} label="barcode" /></details>
      </>;
    }}</ReadState>
  </section>;
}
function PhotoWorkspace({ parcel, disputeId }) {
  const [selected, setSelected] = useState(null), [referencePhoto, setReferencePhoto] = useState(null);
  return <ParcelPhotoSearch parcel={parcel} disputeId={disputeId} onSelect={setSelected} onReferenceChange={setReferencePhoto} selected={selected} referencePhoto={referencePhoto} />;
}
function InvestigationWorkspace({ parcelId, disputeId, method, onMethod, onReset }) {
  const overview = useParcelTraceRead('parcels/' + parcelId, { dispute_id: disputeId });
  return <ReadState state={overview}>{({ parcel, dispute, related_disputes = [] }) => <div className="trace-workspace">
    {method ? <header className="trace-record-header"><div><strong>{parcel.tracking_number}</strong><span>{parcel.courier_name || 'Courier not recorded'}</span></div><button className="trace-link" type="button" onClick={onReset}><ScanLine size={16} /> Scan another parcel</button></header>
      : <div className="trace-found" role="status"><CircleCheck size={17} /><strong>Parcel found</strong><span>{parcel.tracking_number}</span><span>{parcel.unit_reference}</span><span>{parcel.courier_name}</span><Status value={parcel.status} /></div>}
    <div className="trace-record-tools">{(dispute ? [dispute] : related_disputes).map((item) => <DisputeLink key={item.dispute_id} dispute={item} />)}
      <details className="trace-parcel-details"><summary>Parcel details</summary><dl><div><dt>Registered unit</dt><dd>{parcel.unit_reference || 'Not recorded'}</dd></div><div><dt>Parcel room</dt><dd>{parcel.parcel_room_name || 'Not Assigned'}</dd></div><div><dt>Status</dt><dd>{traceLabel(parcel.status)}{parcel.deleted_at ? ' (deleted record)' : ''}</dd></div><div><dt>Registered at</dt><dd>{traceTime(parcel.created_at)}</dd></div><div><dt>Collected at</dt><dd>{traceTime(parcel.collected_at)}</dd></div></dl></details>
    </div><TraceMethods method={method} onChange={onMethod} />
    {method === 'barcode' && <BarcodeTrace parcel={parcel} disputeId={disputeId} />}
    {method === 'photo' && <PhotoWorkspace parcel={parcel} disputeId={disputeId} />}
  </div>}</ReadState>;
}
export function ParcelTracePage() {
  const { user } = useAuth();
  const readContext = () => Object.fromEntries(new URLSearchParams(window.location.search));
  const [context, setContext] = useState(readContext), [search, setSearch] = useState(''), [submitted, setSubmitted] = useState(''), [error, setError] = useState(''), [camera, setCamera] = useState(false);
  const [searchState, setSearchState] = useState({ loading: false, error: '', empty: false });
  const searchRequest = useRef(null);
  const method = ['barcode', 'photo'].includes(context.method) ? context.method : null;
  const focused = Boolean(context.parcel_id && method);
  useEffect(() => {
    const update = () => { searchRequest.current?.abort(); searchRequest.current = null; setSearchState({ loading: false, error: '', empty: false }); setCamera(false); setContext(readContext()); };
    window.addEventListener('popstate', update);
    return () => { window.removeEventListener('popstate', update); searchRequest.current?.abort(); };
  }, []);
  async function findParcel(value) {
    if (searchRequest.current) return;
    if (!value || value.length > 120 || /[\x00-\x1f\x7f]/.test(value)) { setError('Enter a tracking number (up to 120 characters).'); return; }
    setError(''); setSubmitted(value); setCamera(false);
    if (context.parcel_id) navigate('/parcel-trace');
    const controller = new AbortController(); searchRequest.current = controller;
    setSearchState({ loading: true, error: '', empty: false });
    try {
      const data = await getParcelTrace('parcels', { tracking_number: value, page: 1, limit: 2 }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const parcelId = traceSearchTarget(data); searchRequest.current = null;
      setSearchState({ loading: false, error: '', empty: !parcelId });
      if (parcelId) navigate('/parcel-trace?parcel_id=' + encodeURIComponent(parcelId));
    } catch (failure) { if (!controller.signal.aborted) setSearchState({ loading: false, error: failure.message || 'Unable to search parcels. Please try again.', empty: false }); }
    finally { if (searchRequest.current === controller) searchRequest.current = null; }
  }
  function changeMethod(next) { const params = new URLSearchParams(window.location.search); params.set('method', next); navigate('/parcel-trace?' + params); }
  function reset() { setSearch(''); setError(''); navigate('/parcel-trace'); }
  return <ProtectedLayout profile={user}><div className="parcel-trace-page trace-focused-layout">
    {!focused && <>
      <form className="trace-search" onSubmit={(event) => { event.preventDefault(); void findParcel(search.trim()); }}><label htmlFor="trace-tracking"><span className="trace-step">1</span> Scan or enter the tracking number</label><div>
        <div className="trace-search-input"><ScanLine size={19} /><input id="trace-tracking" placeholder="Enter tracking number..." maxLength={120} value={search} disabled={searchState.loading} aria-invalid={Boolean(error)} aria-describedby={error ? 'trace-tracking-error' : undefined} onChange={(event) => { setSearch(event.target.value); setError(''); }} /><button className="trace-camera-button" type="button" disabled={searchState.loading} onClick={() => setCamera(!camera)}><ScanLine size={16} />Use camera</button></div>
        <button className="primary-button" type="submit" disabled={searchState.loading}><Search size={16} />{searchState.loading ? 'Searching...' : 'Find parcel'}</button>
      </div>{error && <p id="trace-tracking-error" className="trace-error" role="alert">{error}</p>}
        {camera && <CollectionBarcodeScanner id="trace-barcode-camera" onClose={() => setCamera(false)} onDetected={(value) => { setSearch(value); void findParcel(value.trim()); }} />}
      </form></>}
    {context.parcel_id ? <InvestigationWorkspace key={context.parcel_id + ':' + (context.dispute_id || '')} parcelId={context.parcel_id} disputeId={context.dispute_id} method={method} onMethod={changeMethod} onReset={reset} />
      : searchState.loading ? <div className="trace-state" role="status"><Spinner label="Searching for parcel..." /></div>
        : searchState.error ? <div className="trace-state" role="alert"><p>{searchState.error}</p><button type="button" className="secondary-button" onClick={() => findParcel(submitted)}><RefreshCw size={14} /> Retry</button></div>
          : searchState.empty ? <p className="trace-empty" role="status">No parcel matches this tracking number.</p> : null}
  </div></ProtectedLayout>;
}

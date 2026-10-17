import { CalendarDays, Download, FileText, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ProtectedLayout } from '../components/ProtectedLayout.jsx';
import { AnalyticsChart, AnalyticsPanel } from '../components/AnalyticsCharts.jsx';
import { Spinner } from '../components/Spinner.jsx';
import { apiDownload, apiRequest } from '../services/api.js';
import { malaysiaToday } from '../utils/adminDashboard.js';
import { ANALYTICS_PRESETS, ANALYTICS_REPORTS, analyticsDuration as duration, analyticsNumber as number, analyticsRange, validAnalyticsRange } from '../utils/analytics.js';
import '../styles/analytics.css';

function RoomFilter({ rooms, value, onChange, compact = false, label = 'Parcel room' }) {
  return <div className={'analytics-room-filter' + (compact && rooms.length <= 3 ? ' compact' : '')}>
    {compact && rooms.length <= 3 && <div className="analytics-segmented analytics-room-buttons" role="group" aria-label="Analytics parcel room"><button type="button" aria-pressed={!value} onClick={() => onChange('')}>All</button>{rooms.map(room => <button type="button" key={room.id} aria-pressed={value === room.id} onClick={() => onChange(room.id)}>{room.name}{room.is_active ? '' : ' (inactive)'}</button>)}</div>}
    <label className="analytics-room-select"><span>{label}</span><select aria-label={label} value={value} onChange={event => onChange(event.target.value)}><option value="">All Parcel Rooms</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.name}{room.is_active ? '' : ' (inactive)'}</option>)}</select></label>
  </div>;
}
function RangeInputs({ value, onChange, prefix = '' }) {
  return <div className="analytics-date-inputs"><label><span>From</span><input aria-label={prefix + 'Start date'} type="date" required max={value.to || malaysiaToday()} value={value.from} onChange={event => onChange({ ...value, from: event.target.value })} /></label><label><span>To</span><input aria-label={prefix + 'End date'} type="date" required min={value.from} max={malaysiaToday()} value={value.to} onChange={event => onChange({ ...value, to: event.target.value })} /></label></div>;
}
function Summary({ rows }) {
  return <dl className="analytics-summary">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
function ReportDialog({ filters, rooms, onClose, onDone }) {
  const ref = useRef(null), busy = useRef(false), controller = useRef(null);
  const [selection, setSelection] = useState({ ...filters, report_type: 'full' }), [pending, setPending] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow, dialog = ref.current;
    dialog.showModal(); document.body.style.overflow = 'hidden';
    return () => { controller.current?.abort(); dialog.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  async function download(event) {
    event.preventDefault();
    if (busy.current) return;
    if (!validAnalyticsRange(selection.from, selection.to)) { setError('Choose valid dates up to today, covering no more than 366 days.'); return; }
    busy.current = true; setPending(true); setError(''); controller.current = new AbortController();
    try {
      const result = await apiDownload('/dashboard/admin/analytics/report?' + new URLSearchParams(selection), { signal: controller.current.signal });
      const url = URL.createObjectURL(result.blob), link = document.createElement('a');
      link.href = url; link.download = result.filename.match(/filename="([^"]+)"/)?.[1] || 'gems-analytics-report.pdf';
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      onDone('Your PDF report has been downloaded.');
    } catch (requestError) { if (!controller.current.signal.aborted) setError(requestError.message || 'Unable to download the report. Please try again.'); }
    finally { busy.current = false; if (!controller.current?.signal.aborted) setPending(false); }
  }
  return createPortal(<dialog ref={ref} className="analytics-report-dialog workspace-theme-surface" aria-labelledby="analytics-report-title" onCancel={event => { event.preventDefault(); if (!busy.current) onClose(); }}><form onSubmit={download}>
    <header><div><h2 id="analytics-report-title">Generate Report</h2><p>PDF document</p></div><button type="button" aria-label="Close report" title="Close report" disabled={pending} onClick={onClose}><X size={18} /></button></header>
    <fieldset disabled={pending}><label><span>Report type</span><select aria-label="Report type" autoFocus value={selection.report_type} onChange={event => setSelection({ ...selection, report_type: event.target.value })}>{ANALYTICS_REPORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <RangeInputs prefix="Report " value={selection} onChange={setSelection} />
      <RoomFilter label="Report parcel room" rooms={rooms} value={selection.room_id} onChange={room_id => setSelection({ ...selection, room_id })} />
    </fieldset>
    {error && <p className="analytics-error" role="alert">{error}</p>}
    <footer><button type="button" disabled={pending} onClick={onClose}>Cancel</button><button type="submit" className="analytics-primary" disabled={pending}>{pending ? <Spinner label="Generating report" /> : <><Download size={16} />Download Report</>}</button></footer>
  </form></dialog>, document.body);
}

export function AnalyticsAndReportingPage() {
  const [preset, setPreset] = useState('30'), [filters, setFilters] = useState(() => ({ ...analyticsRange('30'), room_id: '', group: 'day' }));
  const [draft, setDraft] = useState(() => analyticsRange('30')), [rangeError, setRangeError] = useState('');
  const [state, setState] = useState({ data: null, loading: true, error: '', key: '' }), [revision, setRevision] = useState(0), [report, setReport] = useState(false), [notice, setNotice] = useState('');
  const query = new URLSearchParams(filters).toString(), requestKey = query + ':' + revision;
  useEffect(() => {
    const controller = new AbortController();
    setState(previous => ({ ...previous, loading: true, error: '' }));
    apiRequest('/dashboard/admin/analytics?' + query, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ data, loading: false, error: '', key: requestKey });
    }).catch(error => { if (!controller.signal.aborted) setState(previous => ({ ...previous, loading: false, error: error.message || 'Unable to load analytics.' })); });
    return () => controller.abort();
  }, [requestKey]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); } }, [notice]);
  const { data, loading, error } = state, stale = state.key !== requestKey, rooms = data?.rooms || [];
  function changePreset(value) {
    setPreset(value); setRangeError('');
    if (value === 'custom') { setDraft({ from: filters.from, to: filters.to }); return; }
    const range = analyticsRange(value); setDraft(range); setFilters(previous => ({ ...previous, ...range }));
  }
  const grouping = <div className="analytics-segmented" role="group" aria-label="Trend interval">{[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(([value, label]) => <button key={value} type="button" aria-pressed={filters.group === value} onClick={() => setFilters({ ...filters, group: value })}>{label}</button>)}</div>;
  return <ProtectedLayout><div className="analytics-page">
    <div className="analytics-toolbar"><div className="analytics-period"><CalendarDays size={16} aria-hidden="true" /><label><span className="sr-only">Date range</span><select aria-label="Date range" value={preset} onChange={event => changePreset(event.target.value)}>{ANALYTICS_PRESETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <RoomFilter compact rooms={rooms} value={filters.room_id} onChange={room_id => setFilters({ ...filters, room_id })} />
      <button type="button" className="analytics-primary" disabled={!data || loading || stale || !!error} onClick={() => setReport(true)}><FileText size={16} />Generate Report</button>
    </div>
    {preset === 'custom' && <form className="analytics-custom-range" onSubmit={event => { event.preventDefault(); if (!validAnalyticsRange(draft.from, draft.to)) { setRangeError('Choose valid dates up to today, covering no more than 366 days.'); return; } setRangeError(''); setFilters({ ...filters, ...draft }); }}><RangeInputs value={draft} onChange={setDraft} /><button type="submit">Apply Dates</button>{rangeError && <p className="analytics-error" role="alert">{rangeError}</p>}</form>}
    <div className="analytics-context" role="status"><span>{data ? `${data.range.from} to ${data.range.to} · ${data.room.name}` : 'Loading analytics...'}</span>{data && loading && <span>Updating...</span>}</div>
    {notice && <p className="analytics-notice" role="status">{notice}</p>}
    {error && <div className="analytics-error analytics-request-error" role="alert"><p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)}><RefreshCw size={15} />Retry</button></div>}
    {!data && loading && <div className="analytics-skeleton" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index} />)}</div>}
    {data && <div className="analytics-content" aria-busy={loading || stale} inert={loading || stale ? true : undefined}>
      <div className="analytics-charts-grid">
        <AnalyticsPanel title="Parcel Registration Trends" note={`${data.group === 'week' ? 'Weekly' : data.group === 'month' ? 'Monthly' : 'Daily'} totals · ${number(data.parcel_summary.registered)} registered`} tools={grouping}><AnalyticsChart label="Parcel registration trend" rows={data.registration_trend} field="registered" line /></AnalyticsPanel>
        <AnalyticsPanel title="Parcel Registration Hours" note="Registration time · Malaysia time"><AnalyticsChart label="Parcel registration hours" rows={data.registration_hours} field="registered" /></AnalyticsPanel>
        <AnalyticsPanel title="Parcel Collection Hours" note={`${number(data.parcel_summary.collected)} collected in this period · Malaysia time`}><AnalyticsChart label="Parcel collection hours" rows={data.collection_hours} color="var(--workspace-status-collected, #178348)" /></AnalyticsPanel>
        <AnalyticsPanel title="Time from Notification to Collection" note={`Average ${duration(data.collection_delay.average_hours)} · ${number(data.collection_delay.samples)} collections`}><AnalyticsChart label="Notification to collection time" rows={data.collection_delay.series} field="average_hours" line decimal unit="hours" color="var(--workspace-status-collected, #178348)" /><p className="analytics-footnote">From the first recorded arrival notification; excludes {number(data.collection_delay.missing_notification)} collections without a notification time.</p></AnalyticsPanel>
        <AnalyticsPanel title="Overdue Parcel Duration" note={`Full days past the deadline · uncollected at ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(data.range.to + 'T00:00:00+08:00'))}`}><AnalyticsChart label="Overdue parcel duration" rows={data.overdue_duration} horizontal color="var(--workspace-status-overdue, #bf3046)" /></AnalyticsPanel>
        <AnalyticsPanel title="Parcel Collection Rate" note="Parcels registered and collected within the selected period"><div className="analytics-rate"><strong>{data.parcel_summary.collection_rate === null ? '--' : number(data.parcel_summary.collection_rate) + '%'}<span>collected within the period</span></strong><div className="analytics-rate-track" role="meter" aria-label="Collection rate" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.parcel_summary.collection_rate ?? 0} aria-valuetext={data.parcel_summary.collection_rate === null ? 'No registrations in this period' : undefined}><span style={{ width: (data.parcel_summary.collection_rate || 0) + '%' }} /></div><Summary rows={[[ 'Registered in period', number(data.parcel_summary.registered)], ['Collected within period', number(data.parcel_summary.cohort_collected)], ['Not collected within period', number(data.parcel_summary.cohort_uncollected)]]} /><p className="analytics-footnote">Only parcels registered in this period are counted in the rate. Older parcels collected during this period are excluded.</p></div></AnalyticsPanel>
        <AnalyticsPanel title="Disputes by Issue Type" note={`${number(data.dispute_summary.reported)} reported in this period`}><AnalyticsChart label="Disputes by issue type" rows={data.dispute_issues} horizontal unit="disputes" /></AnalyticsPanel>
        <AnalyticsPanel title="Dispute Resolution Time" note={`Average ${duration(data.dispute_summary.average_resolution_hours)} · resolved in this period`}><AnalyticsChart label="Dispute resolution time" rows={data.dispute_resolution} horizontal unit="disputes" color="#218060" /></AnalyticsPanel>
      </div>
      <div className="analytics-summaries-grid"><AnalyticsPanel title="Dispute Summary" note="Selected room and period"><Summary rows={[[ 'Reported in period', number(data.dispute_summary.reported)], ['Resolved in period', number(data.dispute_summary.resolved)], ['Unresolved at period end', number(data.dispute_summary.unresolved)], ['Average resolution time', duration(data.dispute_summary.average_resolution_hours)]]} /></AnalyticsPanel>
        <AnalyticsPanel title="Current System Summary" note="Building-wide totals now · not filtered by room or period"><Summary rows={[[ 'Active residents', number(data.system_summary.active_residents)], ['Active guards', number(data.system_summary.active_guards)], ['Residents awaiting activation', number(data.system_summary.residents_awaiting_activation)], ['Guards awaiting activation', number(data.system_summary.guards_awaiting_activation)], ['Active parcel rooms', number(data.system_summary.active_rooms)], ['Inactive parcel rooms', number(data.system_summary.inactive_rooms)]]} /></AnalyticsPanel></div>
      {data.parcel_summary.missing_collection_time > 0 && <p className="analytics-footnote analytics-coverage">{number(data.parcel_summary.missing_collection_time)} collected parcels registered before the period ended have no collection time recorded. They are excluded from time-based totals.</p>}
    </div>}
    {report && <ReportDialog filters={filters} rooms={rooms} onClose={() => setReport(false)} onDone={message => { setReport(false); setNotice(message); }} />}
  </div></ProtectedLayout>;
}

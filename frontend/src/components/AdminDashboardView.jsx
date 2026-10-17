import { ArrowDownToLine, ArrowRight, CalendarDays, CheckCheck, ChevronRight, Clock3, FileOutput, MessageSquareWarning, Package, RefreshCw, ShieldAlert, Users } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { apiRequest } from '../services/api.js';
import { navigate } from '../utils/navigation.js';
import { malaysiaToday, shiftDashboardDate } from '../utils/adminDashboard.js';
import { dashboardPendingSections, ISSUE_COLORS, ISSUE_LABELS, peakBucket, roomChartRows, roomChartScale, validDashboardDates } from '../utils/adminOperations.js';
import { useAdminDashboardMotion, useMetricSpotlight } from '../hooks/useAdminDashboardMotion.js';
import { DashboardGreeting } from './DashboardStatus.jsx';
import { Spinner } from './Spinner.jsx';
import { StaffDisputeCard } from './StaffDisputeCard.jsx';

const number = (value) => (Number(value) || 0).toLocaleString('en-MY');
function Panel({ title, tools, children, className = '', description, busy = false, disabled = false }) {
  return <section className={'adm-panel ' + className} aria-label={title} aria-busy={busy}><header className="adm-panel-heading"><div className="ops-panel-title"><div><h2>{title}</h2>{busy && <span className="ops-section-status" role="status"><Spinner label={'Updating ' + title.toLowerCase() + '...'} /></span>}</div>{description && <p>{description}</p>}</div>{tools}</header><fieldset className="ops-panel-content" disabled={disabled}>{children}</fieldset></section>;
}
function OverviewRoomFilter({ value, rooms, onChange }) {
  return <div className={'ops-overview-filter' + (rooms.length <= 3 ? ' is-compact' : '')}>
    {rooms.length <= 3 && <div className="ops-room-options ops-segmented" role="group" aria-label="Parcel room selection">
      <button type="button" aria-pressed={value === ''} onClick={() => onChange('')}>All</button>
      {rooms.map((room) => <button type="button" key={room.id} aria-pressed={value === room.id} onClick={() => onChange(room.id)}>{room.name}{room.is_active ? '' : ' (inactive)'}</button>)}
      {value === 'unassigned' && <button type="button" aria-pressed="true" onClick={() => onChange('unassigned')}>Not Assigned</button>}
    </div>}
    <label className="ops-select ops-overview-select"><span>Parcel room</span><select aria-label="Parcel room" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">All</option>{rooms.map((room) => <option value={room.id} key={room.id}>{room.name}{room.is_active ? '' : ' (inactive)'}</option>)}<option value="unassigned">Not Assigned</option>
    </select></label>
  </div>;
}
function Metric({ label, value, icon: Icon, tone }) {
  const valueRef = useRef(null), spotlightRef = useMetricSpotlight();
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) return;
    const animation = valueRef.current?.animate([{ opacity: .4, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 420, easing: 'cubic-bezier(.23,1,.32,1)' });
    return () => animation?.cancel();
  }, [value]);
  return <article ref={spotlightRef} className={'adm-metric ops-metric ' + tone} aria-label={label}><span className="ops-metric-icon"><Icon size={23} aria-hidden="true" /></span><div className="ops-metric-copy"><strong><span ref={valueRef} className="adm-number-current">{number(value)}</span></strong><span>{label}</span></div></article>;
}
function DateRange({ name, from, to, onApply }) {
  const [draft, setDraft] = useState({ from, to }), [error, setError] = useState('');
  return <form className="ops-date-range" onSubmit={(event) => { event.preventDefault(); if (!validDashboardDates(draft.from, draft.to)) { setError('Choose a date range of up to 366 days.'); return; } setError(''); onApply(draft); }}>
    <label>From<input type="date" aria-label={name + ' start date'} required value={draft.from} onChange={(event) => { const value = event.target.value; setDraft((current) => ({ ...current, from: value })); }} /></label>
    <label>To<input type="date" aria-label={name + ' end date'} required min={draft.from} value={draft.to} onChange={(event) => { const value = event.target.value; setDraft((current) => ({ ...current, to: value })); }} /></label>
    <button type="submit" className="adm-secondary" aria-label={'Apply ' + name.toLowerCase() + ' dates'}><CalendarDays size={14} />Apply</button>
    {error && <p className="ops-error" role="alert">{error}</p>}
  </form>;
}
function ChartData({ headings, rows }) {
  return <details className="adm-data"><summary>View chart data</summary><div className="adm-table-scroll" tabIndex={0}><table><thead><tr>{headings.map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column}>{value}</td>)}</tr>)}</tbody></table></div></details>;
}
function RoomChart({ rows }) {
  const [filter, setFilter] = useState('ALL'), [activeRoom, setActiveRoom] = useState(null);
  const tooltipId = useId();
  const visible = roomChartRows(rows, filter), { ceiling, ticks } = roomChartScale(visible);
  const motion = useAdminDashboardMotion('room-stacks', JSON.stringify([filter, visible]));
  return <Panel title="Uncollected Parcels by Room" tools={<div className="ops-room-controls"><div className="ops-segmented" role="group" aria-label="Room chart view"><button type="button" aria-pressed={filter === 'ALL'} onClick={() => { setFilter('ALL'); setActiveRoom(null); }}>All Uncollected</button><button type="button" aria-pressed={filter !== 'ALL'} onClick={() => { if (filter === 'ALL') setFilter('PENDING'); setActiveRoom(null); }}>By Status</button></div>{filter !== 'ALL' && <label className="ops-select"><span className="sr-only">Room chart status</span><select aria-label="Room chart status" value={filter} onChange={(event) => { setFilter(event.target.value); setActiveRoom(null); }}><option value="PENDING">Awaiting Collection Only</option><option value="OVERDUE">Overdue Only</option></select></label>}</div>}>
    <div className="ops-legend"><span><i className="pending" />Awaiting Collection</span><span><i className="overdue" />Overdue</span></div>
    {visible.length ? <div ref={motion} className="ops-room-chart" role="group" aria-label="Uncollected parcel counts by room">
      <div className="ops-room-rows"><div className="ops-room-grid" aria-hidden="true">{ticks.map((tick) => <i key={tick} style={{ left: tick / ceiling * 100 + '%' }} />)}</div>
        {visible.map((row) => <div className="ops-room-bar" key={row.parcel_room_id} role="group" tabIndex={0}
          aria-label={row.parcel_room_name + ': ' + (filter !== 'OVERDUE' ? number(row.pending) + ' awaiting collection, ' : '') + (filter !== 'PENDING' ? number(row.overdue) + ' overdue, ' : '') + number(row.visible_total) + ' total'}
          aria-describedby={activeRoom === row.parcel_room_id ? tooltipId : undefined}
          onPointerEnter={() => setActiveRoom(row.parcel_room_id)} onPointerLeave={(event) => { if (document.activeElement !== event.currentTarget) setActiveRoom(null); }}
          onFocus={() => setActiveRoom(row.parcel_room_id)} onBlur={(event) => { if (!event.currentTarget.matches(':hover')) setActiveRoom(null); }}
          onClick={(event) => event.currentTarget.focus()} onKeyDown={(event) => { if (event.key === 'Escape') setActiveRoom(null); }}>
          <span>{row.parcel_room_name}{row.is_active === false && <small>Inactive room</small>}</span><div className="ops-room-plot" style={{ '--total-position': row.visible_total / ceiling * 100 + '%' }}><div className="ops-stack">
            <span className="pending" style={{ width: row.pending / ceiling * 100 + '%' }}><span className="ops-segment-count" aria-hidden="true">{number(row.pending)}</span></span>
            <span className="overdue" style={{ width: row.overdue / ceiling * 100 + '%' }}><span className="ops-segment-count" aria-hidden="true">{number(row.overdue)}</span></span>
          </div><strong>{number(row.visible_total)}</strong></div>
          {activeRoom === row.parcel_room_id && <div className="ops-room-tooltip" id={tooltipId} role="tooltip"><strong>{row.parcel_room_name}</strong><dl>
            {filter !== 'OVERDUE' && <div><dt><i className="pending" />Awaiting Collection</dt><dd>{number(row.pending)}</dd></div>}
            {filter !== 'PENDING' && <div><dt><i className="overdue" />Overdue</dt><dd>{number(row.overdue)}</dd></div>}
            <div className="ops-room-tooltip-total"><dt>{filter === 'ALL' ? 'Uncollected' : 'Total shown'}</dt><dd>{number(row.visible_total)}</dd></div>
          </dl></div>}
        </div>)}
      </div>
      <div className="ops-room-axis" aria-hidden="true"><div>{ticks.map((tick, index) => <span key={tick} className={ticks.length > 5 && index % 2 && index !== ticks.length - 1 ? 'ops-minor-tick' : ''} style={{ left: tick / ceiling * 100 + '%' }}>{number(tick)}</span>)}<p>Number of Parcels</p></div></div>
    </div> : <p className="ops-empty">No assigned parcel rooms to show.</p>}
  </Panel>;
}
function IssueChart({ rows, range, onRange, busy, disabled }) {
  const [highlight, setHighlight] = useState('');
  const motion = useAdminDashboardMotion('status', JSON.stringify(rows));
  const total = rows.reduce((sum, row) => sum + Number(row.count), 0), selected = rows.find((row) => row.issue_type === highlight);
  let offset = 0;
  return <Panel title="Most reported dispute issues" busy={busy} disabled={disabled}>
    <DateRange key={range.from + ':' + range.to} name="Dispute" from={range.from} to={range.to} onApply={onRange} />
    {!total ? <p className="ops-empty">No disputes reported for these dates.</p> : <div ref={motion} className="adm-status-content ops-issue-chart"><div className="adm-donut"><svg viewBox="0 0 168 168" role="img" aria-label={number(total) + ' disputes by issue type'}>
      <circle cx="84" cy="84" r="62" fill="none" stroke="#edf1f8" strokeWidth="14" />
      <circle className="adm-donut-inner-ring" cx="84" cy="84" r="47" fill="none" stroke="#e2e5e9" strokeWidth="1.2" />
      {rows.map((row) => { const length = Number(row.count) / total * 100, start = offset; offset += length; return <circle key={row.issue_type} className="adm-status-arc" data-length={length} cx="84" cy="84" r="62" fill="none" stroke={ISSUE_COLORS[row.issue_type]} strokeWidth={highlight === row.issue_type ? 18 : 14} pathLength="100" strokeDasharray={length + ' 100'} strokeDashoffset={-start} transform="rotate(-90 84 84)"><title>{ISSUE_LABELS[row.issue_type] + ': ' + row.count}</title></circle>; })}
    </svg><div className="adm-donut-centre"><strong>{number(selected?.count ?? total)}</strong><small>{selected ? ISSUE_LABELS[selected.issue_type] : 'Disputes reported'}</small></div></div>
      <div className="adm-status-key">{rows.map((row) => <button type="button" key={row.issue_type} aria-pressed={highlight === row.issue_type} onClick={() => setHighlight((value) => value === row.issue_type ? '' : row.issue_type)} onPointerEnter={() => setHighlight(row.issue_type)} onPointerLeave={() => setHighlight('')} onFocus={() => setHighlight(row.issue_type)} onBlur={() => setHighlight('')}><i style={{ background: ISSUE_COLORS[row.issue_type] }} /><span>{ISSUE_LABELS[row.issue_type]}<small>{(Number(row.count) / total * 100).toFixed(1)}%</small></span><b>{number(row.count)}</b></button>)}</div>
    </div>}
    <ChartData headings={['Issue', 'Disputes']} rows={rows.map((row) => [ISSUE_LABELS[row.issue_type], number(row.count)])} />
  </Panel>;
}
function PeakChart({ data, onRange, onGroup, busy, disabled }) {
  const plotRef = useRef(null), [width, setWidth] = useState(640), [active, setActive] = useState(null);
  const motion = useAdminDashboardMotion('activity', JSON.stringify(data));
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    if (plotRef.current) observer.observe(plotRef.current);
    return () => observer.disconnect();
  }, []);
  const rows = data.buckets, max = Math.max(4, ...rows.flatMap((row) => [row.received, row.collected])), ceiling = Math.ceil(max / 4) * 4;
  const height = 250, left = 38, right = width - 20, bottom = height - 35;
  const points = (field) => rows.map((row, index) => [left + index / Math.max(1, rows.length - 1) * (right - left), bottom - row[field] / ceiling * (bottom - 16)]);
  const line = (series) => series.map(([x, y], index) => (index ? 'L' : 'M') + x + ',' + y).join(' ');
  const received = points('received'), collected = points('collected'), chosen = active === null ? null : rows[active];
  const peakReceived = peakBucket(rows, 'received'), peakCollected = peakBucket(rows, 'collected');
  return <Panel title="Peak registration & collection times" busy={busy} disabled={disabled} tools={<div className="ops-segmented" aria-label="Activity grouping">{[['hour', 'Hour of day'], ['weekday', 'Day of week']].map(([value, label]) => <button type="button" key={value} aria-pressed={data.group === value} onClick={() => { setActive(null); onGroup(value); }}>{label}</button>)}</div>}>
    <DateRange key={data.from + ':' + data.to} name="Activity" from={data.from} to={data.to} onApply={onRange} />
    <div className="ops-legend"><span><i className="received" />Registered</span><span><i className="collected" />Collected</span></div>
    <div ref={plotRef} className="adm-chart ops-peak-chart" tabIndex={0} aria-label="Registration and collection trend" onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setActive(Math.max(0, Math.min(rows.length - 1, Math.round((event.clientX - rect.left - left) / (right - left) * (rows.length - 1))))); }} onPointerLeave={() => setActive(null)} onBlur={() => setActive(null)} onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); setActive((value) => Math.max(0, Math.min(rows.length - 1, (value ?? 0) + (event.key === 'ArrowRight' ? 1 : -1)))); } }}>
      <svg ref={motion} viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label="Parcels registered and collected in the selected dates">
        {[0, 1, 2, 3, 4].map((tick) => <g key={tick}><line className="adm-gridline" x1={left} x2={right} y1={bottom - tick / 4 * (bottom - 16)} y2={bottom - tick / 4 * (bottom - 16)} /><text x={left - 8} y={bottom + 4 - tick / 4 * (bottom - 16)} textAnchor="end">{number(ceiling * tick / 4)}</text></g>)}
        <g className="adm-trend-lines"><path d={line(received)} stroke="#3260d7" strokeWidth="2.5" fill="none" /><path d={line(collected)} stroke="#21a87a" strokeWidth="2.5" fill="none" /></g>
        {rows.map((row, index) => index % Math.max(1, Math.ceil(rows.length / Math.max(3, Math.floor(width / 70)))) === 0 || index === rows.length - 1 ? <text key={row.index} x={received[index][0]} y={height - 9} textAnchor="middle">{row.label}</text> : null)}
        {chosen && <g><line x1={received[active][0]} x2={received[active][0]} y1="16" y2={bottom} stroke="#9aaaca" />{[received, collected].map((series, index) => <circle key={index} cx={series[active][0]} cy={series[active][1]} r="4" fill="#fff" stroke={index ? '#21a87a' : '#3260d7'} strokeWidth="2" />)}</g>}
      </svg>
      {chosen && <div className="adm-chart-tooltip" role="status"><strong>{chosen.label}</strong><span>Registered <b>{number(chosen.received)}</b></span><span>Collected <b>{number(chosen.collected)}</b></span></div>}
    </div>
    <div className="ops-peaks"><span>Peak registrations: <b>{peakReceived ? peakReceived.label + ' (' + number(peakReceived.received) + ')' : 'None recorded'}</b></span><span>Peak collections: <b>{peakCollected ? peakCollected.label + ' (' + number(peakCollected.collected) + ')' : 'None recorded'}</b></span></div>
    {data.collection_time_unknown > 0 && <p className="adm-footnote">{number(data.collection_time_unknown)} older collected parcels have no collection time and are not included in this chart.</p>}
    <ChartData headings={['Time', 'Registered', 'Collected']} rows={rows.map((row) => [row.label, number(row.received), number(row.collected)])} />
  </Panel>;
}
function DisputeActions({ disputes }) {
  return <Panel className="ops-dispute-actions" title={'Disputes needing your action (' + number(disputes.action_total) + ')'}
    description={number(disputes.escalated) + ' escalated, awaiting pickup \u00b7 ' + number(disputes.my_review) + ' in your review'}
    tools={<button type="button" className="adm-link" onClick={() => navigate('/disputes')}>View All<ArrowRight size={14} /></button>}>
    {disputes.action_items.length ? <div className="ops-dispute-cards">{disputes.action_items.map(dispute => <StaffDisputeCard
      key={dispute.dispute_id} dispute={dispute} statusLabel={dispute.status === 'ESCALATED' ? 'Awaiting pickup' : 'In your review'}
      onOpen={(id) => navigate('/disputes?dispute_id=' + encodeURIComponent(id))} />)}</div> : <p className="ops-empty">No disputes need your action right now.</p>}
  </Panel>;
}
function ImportantAlerts({ alerts }) {
  const overdue = Number(alerts.parcels_overdue_over_60_days) || 0, disputes = Number(alerts.disputes_unresolved_over_7_days) || 0;
  const residents = Number(alerts.resident_pending_activation) || 0, guards = Number(alerts.guard_pending_activation) || 0;
  const items = [
    { count: overdue, sentence: <><strong>{number(overdue)} {overdue === 1 ? 'parcel' : 'parcels'}</strong>{overdue === 1 ? ' has' : ' have'} been <strong className="ops-attention-keyword">overdue</strong> for more than <strong>60 days</strong>.</>, icon: Clock3, tone: 'amber', path: '/parcels?status=OVERDUE&date_range=all' },
    { count: disputes, sentence: <><strong>{number(disputes)} {disputes === 1 ? 'dispute' : 'disputes'}</strong>{disputes === 1 ? ' has' : ' have'} been <strong className="ops-attention-keyword">unresolved</strong> for more than <strong>7 days</strong>.</>, icon: MessageSquareWarning, tone: 'rose', path: '/disputes' },
    { count: residents, sentence: <><strong>{number(residents)} {residents === 1 ? 'resident' : 'residents'}</strong>{residents === 1 ? ' has' : ' have'} <strong className="ops-attention-keyword">not activated</strong> their {residents === 1 ? 'account' : 'accounts'}.</>, icon: Users, tone: 'blue', path: '/accounts' },
    { count: guards, sentence: <><strong>{number(guards)} {guards === 1 ? 'guard' : 'guards'}</strong>{guards === 1 ? ' has' : ' have'} <strong className="ops-attention-keyword">not activated</strong> their {guards === 1 ? 'account' : 'accounts'}.</>, icon: ShieldAlert, tone: 'teal', path: '/accounts' }
  ].filter(item => item.count > 0);
  return <Panel title="Needs attention" className="ops-important-alerts">
    {items.length ? <ul className="ops-alert-list">{items.map(({ sentence, icon: Icon, tone, path }) => <li key={tone}>
      <a className={'ops-attention-item ' + tone} href={path} onClick={(event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(path); } }}>
        <span className={'ops-attention-icon ' + tone}><Icon size={21} aria-hidden="true" /></span>
        <span className="ops-attention-copy">{sentence}</span>
        <ChevronRight className="ops-attention-arrow" size={18} aria-hidden="true" />
      </a>
    </li>)}</ul> : <p className="ops-empty">Nothing needs attention right now.</p>}
  </Panel>;
}
export function AdminDashboardView({ onReport, toast, analytics = false }) {
  const today = malaysiaToday(), initialFrom = shiftDashboardDate(today, -6);
  const [filters, setFilters] = useState({ summary_room_id: '', dispute_from: today.slice(0,8) + '01', dispute_to: today, trend_from: initialFrom, trend_to: today, trend_group: 'hour' });
  const [state, setState] = useState({ key: '', data: null, loading: true, error: '', applied: null, revision: null }), [rooms, setRooms] = useState([]), [revision, setRevision] = useState(0);
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '')).toString();
  const requestKey = query + ':' + revision;
  useEffect(() => {
    const controller = new AbortController(); setState((current) => ({ ...current, key: requestKey, loading: true, error: '' }));
    apiRequest('/dashboard/admin/operations?' + query, { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      setRooms(data.rooms); setState({ key: requestKey, data, loading: false, error: '', applied: filters, revision });
    }).catch((error) => { if (!controller.signal.aborted) setState((current) => ({ ...current, key: requestKey, loading: false, error: error.message || 'Unable to load dashboard data.' })); });
    return () => controller.abort();
  }, [query, revision]);
  useEffect(() => {
    const timer = setInterval(() => { if (malaysiaToday() !== today) setRevision((value) => value + 1); }, 60000);
    return () => clearInterval(timer);
  }, [today]);
  function change(key, value) { setFilters((current) => ({ ...current, [key]: value })); }
  const data = state.data, loading = state.loading || state.key !== requestKey, summary = data?.parcel_summary;
  const pending = dashboardPendingSections(filters, state.applied, state.revision !== revision);
  const busy = (section) => loading && pending[section];
  const disabled = (section) => pending[section] && (loading || !!state.error);
  return <div className="adm-dashboard adm-operations">
    <main className="adm-content">
      {!analytics && <DashboardGreeting />}
      {toast && <p className="adm-feedback" role="status">{toast}</p>}
      {analytics ? <div className="ops-page-actions"><button type="button" className="adm-secondary ops-report-action" aria-label="Export report" onClick={onReport}><FileOutput size={16} />Export Report</button></div> : <header className="adm-summary-heading ops-overview-heading"><div className="ops-overview-title"><h2>Parcel Summary</h2></div><div className="ops-overview-tools"><OverviewRoomFilter rooms={rooms} value={filters.summary_room_id} onChange={(value) => change('summary_room_id', value)} /></div></header>}
      {loading && !data && <div className="ops-loading" role="status"><Spinner label="Loading dashboard..." /></div>}
      {state.error && !loading && <div className="adm-state" role="alert"><p>{state.error}</p><button type="button" className="adm-secondary" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={14} />Retry</button><button type="button" className="adm-secondary" onClick={() => { setFilters({ summary_room_id: '', dispute_from: today.slice(0,8) + '01', dispute_to: today, trend_from: initialFrom, trend_to: today, trend_group: 'hour' }); setRevision((value) => value + 1); }}>Reset filters</button></div>}
      {data && <div className="ops-content" data-loading={loading}>
        {analytics ? <>
          <IssueChart busy={busy('disputes')} disabled={disabled('disputes')} rows={data.disputes.issue_types} range={data.disputes.issue_range} onRange={({ from, to }) => setFilters((current) => ({ ...current, dispute_from: from, dispute_to: to }))} />
          <PeakChart busy={busy('peak')} disabled={disabled('peak')} data={data.peak_activity} onRange={({ from, to }) => setFilters((current) => ({ ...current, trend_from: from, trend_to: to }))} onGroup={(group) => change('trend_group', group)} />
        </> : <>
        <div className="adm-metrics ops-parcel-metrics" aria-busy={busy('summary')}>
          <Metric label="Registered Today" value={summary.received_today} icon={ArrowDownToLine} tone="blue" />
          <Metric label="Collected Today" value={summary.collected_today} icon={CheckCheck} tone="green" />
          <Metric label="Awaiting Collection" value={summary.awaiting_collection} icon={Package} tone="amber" />
          <Metric label="Overdue" value={summary.overdue} icon={Clock3} tone="rose" />
        </div>
        <div className="ops-room-attention"><RoomChart rows={data.uncollected_by_room} /><ImportantAlerts alerts={data.important_alerts} /></div>
        <DisputeActions disputes={data.disputes} />
        </>}
      </div>}
    </main>
  </div>;
}

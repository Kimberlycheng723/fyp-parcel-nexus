import { useEffect, useId, useRef, useState } from 'react';
import { analyticsNumber as number, analyticsScale } from '../utils/analytics.js';

export function AnalyticsPanel({ title, note, tools, children, className = '' }) {
  const id = useId();
  return <section className={'analytics-panel ' + className} aria-labelledby={id}><header><div><h2 id={id}>{title}</h2>{note && <p>{note}</p>}</div>{tools}</header>{children}</section>;
}

export function AnalyticsChart({ rows, field = 'count', label, color = 'var(--workspace-accent, #2948d3)', line = false, horizontal = false, unit = 'parcels', decimal = false }) {
  const ref = useRef(null), [width, setWidth] = useState(480), [active, setActive] = useState(null), helpId = useId();
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(220, Math.floor(entry.contentRect.width))));
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setActive(null); }, [rows]);
  const { ceiling, ticks } = analyticsScale(rows.map(row => row[field]), !decimal);
  const left = horizontal ? Math.min(144, width * .42) : 36, right = width - (horizontal ? 35 : 12);
  const height = horizontal ? Math.max(190, rows.length * 38 + 30) : 226, top = 14, bottom = height - 38;
  const chosen = active === null ? null : rows[active];
  const y = value => bottom - Number(value || 0) / ceiling * (bottom - top);
  const x = index => left + (line ? rows.length === 1 ? .5 : index / (rows.length - 1) : (index + .5) / rows.length) * (right - left);
  let connected = false;
  const path = rows.map((row, index) => {
    if (row[field] === null || row[field] === undefined) { connected = false; return ''; }
    const result = (connected ? 'L' : 'M') + x(index) + ',' + y(row[field]); connected = true; return result;
  }).join(' ');
  const hasData = rows.some(row => row[field] !== null && (decimal || row[field] > 0));
  const labelStep = Math.max(1, Math.ceil(rows.length / Math.max(3, Math.floor(width / 72))));
  function keyDown(event) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Escape'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Escape') setActive(null);
      else if (event.key === 'Home') setActive(0);
      else if (event.key === 'End') setActive(rows.length - 1);
      else setActive(index => Math.max(0, Math.min(rows.length - 1, (index ?? -1) + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1))));
    }
  }
  function pointer(event) {
    if (horizontal) return;
    const bounds = event.currentTarget.getBoundingClientRect(), offset = (event.clientX - bounds.left - left) / (right - left);
    setActive(Math.max(0, Math.min(rows.length - 1, Math.round(offset * (line ? rows.length - 1 : rows.length) - (line ? 0 : .5)))));
  }
  return <div ref={ref} className="analytics-chart" tabIndex={0} role="group" aria-label={label} aria-describedby={helpId}
    onKeyDown={keyDown} onFocus={() => setActive(index => index ?? 0)} onBlur={() => setActive(null)} onPointerLeave={event => { if (document.activeElement !== event.currentTarget) setActive(null); }}>
    <span className="sr-only" id={helpId}>Use arrow keys to inspect values. Home and End select the first and last value. Escape hides the value.</span>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} onPointerMove={pointer} onClick={pointer}>
      <title>{label}</title>
      {ticks.map(tick => horizontal ? <g key={tick}><line x1={left + tick / ceiling * (right - left)} x2={left + tick / ceiling * (right - left)} y1={top} y2={bottom} className="analytics-gridline" /><text x={left + tick / ceiling * (right - left)} y={height - 16} textAnchor="middle">{number(tick)}</text></g> : <g key={tick}><line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className="analytics-gridline" /><text x={left - 9} y={y(tick) + 4} textAnchor="end">{number(tick)}</text></g>)}
      {line ? <>
        <path d={path} stroke={color} strokeWidth="2.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {rows.map((row, index) => row[field] !== null && row[field] !== undefined && (rows.length < 35 || active === index) ? <circle key={row.key || index} cx={x(index)} cy={y(row[field])} r={active === index ? 4 : 2.5} fill="#fff" stroke={color} strokeWidth="2" /> : null)}
        {chosen && <line x1={x(active)} x2={x(active)} y1={top} y2={bottom} className="analytics-crosshair" />}
      </> : rows.map((row, index) => {
        const step = horizontal ? (bottom - top) / rows.length : (right - left) / rows.length;
        return <g key={row.key || row.label} onPointerEnter={() => setActive(index)} onClick={event => { event.stopPropagation(); setActive(index); }}>
          {horizontal ? <><rect x={left} y={top + index * step + 5} width={Math.max(0, Number(row[field] || 0) / ceiling * (right - left))} height={Math.min(22, step - 10)} rx="3" fill={color} opacity={active !== null && active !== index ? .4 : 1} /><text x={left - 10} y={top + index * step + 20} textAnchor="end" className="analytics-bar-label">{row.label.length > 21 && width < 390 ? row.label.slice(0, 19) + '...' : row.label}</text><text x={left + Number(row[field] || 0) / ceiling * (right - left) + 7} y={top + index * step + 20} className="analytics-bar-total">{number(row[field])}</text><rect x="0" y={top + index * step} width={width} height={step} fill="transparent" /></> : <>
            <rect x={x(index) - Math.min(32, step * .65) / 2} y={y(row[field])} width={Math.min(32, step * .65)} height={Math.max(0, bottom - y(row[field]))} rx="3" fill={color} opacity={active !== null && active !== index ? .4 : 1} />
            <rect x={left + index * step} y={top} width={step} height={bottom - top} fill="transparent" />
          </>}
          <title>{row.label + ': ' + number(row[field]) + ' ' + unit}</title>
        </g>;
      })}
      {!horizontal && rows.map((row, index) => index % labelStep === 0 || index === rows.length - 1 ? <text key={row.key || row.label} x={x(index)} y={height - 16} textAnchor="middle">{row.label.replace('Week of ', '').replace(':00', '')}</text> : null)}
    </svg>
    <div className="analytics-chart-readout" role="status" aria-live="polite">{chosen ? <><span>{chosen.label}</span><strong>{chosen[field] === null ? 'Not recorded' : number(chosen[field]) + ' ' + unit}{decimal && chosen.samples !== undefined ? ` · ${number(chosen.samples)} collections` : ''}</strong></> : <span>{hasData ? (decimal ? 'Hours from arrival notification to collection' : 'Number of ' + unit) : 'No ' + (decimal ? 'timing samples' : unit) + ' recorded for this period.'}</span>}</div>
  </div>;
}

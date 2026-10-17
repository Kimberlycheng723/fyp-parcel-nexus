import { CalendarDays, FileImage, GripVertical } from 'lucide-react';
import { disputeIssueLabel, formatMalaysiaDate } from '../utils/disputes.js';

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

export function StaffDisputeCard({ dispute, onOpen, draggable = false, onDragStart, onDragEnd, statusLabel }) {
  const handler = dispute.assigned_handler?.name || 'Unassigned';
  return <article className="staff-dispute-card" role="button" aria-label={'Open dispute ' + dispute.dispute_reference}
    draggable={draggable} tabIndex={0} onClick={() => onOpen(dispute.dispute_id)}
    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(dispute.dispute_id); } }}
    onDragStart={onDragStart ? (event) => onDragStart(event, dispute) : undefined} onDragEnd={onDragEnd}>
    <div className="staff-dispute-card-heading"><span>{dispute.dispute_reference}</span>
      {statusLabel && <small className="staff-dispute-card-stage">{statusLabel}</small>}
      {draggable && <GripVertical size={15} aria-label="Drag dispute" />}
    </div>
    <div className="staff-dispute-card-tags">
      <span className={`staff-issue-badge issue-${dispute.issue_type.toLowerCase()}`}>{disputeIssueLabel(dispute.issue_type)}</span>
      {dispute.evidence_count > 0 && <span title={`${dispute.evidence_count} evidence image(s)`}><FileImage size={13} /> {dispute.evidence_count}</span>}
    </div>
    <strong className="staff-dispute-tracking" title={dispute.parcel.tracking_number}>{dispute.parcel.tracking_number}</strong>
    <dl className="staff-dispute-card-details">
      <div><dt>Courier</dt><dd>{dispute.parcel.courier_name}</dd></div>
      <div><dt>Unit</dt><dd>{dispute.resident?.unit_full_code || dispute.parcel.unit_full_code}</dd></div>
    </dl>
    <footer><span><CalendarDays size={13} /> {formatMalaysiaDate(dispute.created_at)}</span>
      <span className="staff-card-handler" title={handler}><i>{initials(handler === 'Unassigned' ? '?' : handler)}</i>{handler}</span>
    </footer>
    <small>Latest activity {formatMalaysiaDate(dispute.latest_activity_at, { hour: '2-digit', minute: '2-digit' })}</small>
  </article>;
}

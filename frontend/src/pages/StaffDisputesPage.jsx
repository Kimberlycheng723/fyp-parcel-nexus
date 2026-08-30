import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
  FileImage,
  Filter,
  GripVertical,
  RefreshCw,
  Search,
  UserCheck
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { StaffDisputeDetailModal } from "../components/StaffDisputeDetailModal.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getDisputes, transitionDispute } from "../services/api.js";
import { acquireRealtimeSocket, releaseRealtimeSocket } from "../services/socket.js";
import {
  DISPUTE_ISSUE_TYPES,
  disputeIssueLabel,
  disputeStatusLabel,
  formatMalaysiaDate
} from "../utils/disputes.js";

const LIFECYCLE_COLUMNS = Object.freeze([
  { status: "OPEN", label: "Open", tone: "open" },
  { status: "IN_REVIEW_GUARD", label: "In Review (Guard)", tone: "guard" },
  { status: "ESCALATED", label: "Escalated", tone: "escalated" },
  { status: "IN_REVIEW_ADMIN", label: "In Review (Admin)", tone: "admin" },
  { status: "RESOLVED", label: "Resolved", tone: "resolved" }
]);

const ROLE_TRANSITIONS = Object.freeze({
  GUARD: Object.freeze({
    OPEN: Object.freeze(["IN_REVIEW_GUARD"]),
    IN_REVIEW_GUARD: Object.freeze(["ESCALATED", "RESOLVED"])
  }),
  ADMIN: Object.freeze({
    OPEN: Object.freeze(["IN_REVIEW_ADMIN", "RESOLVED"]),
    ESCALATED: Object.freeze(["IN_REVIEW_ADMIN", "RESOLVED"]),
    IN_REVIEW_ADMIN: Object.freeze(["RESOLVED"])
  })
});

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function canMove(role, dispute, targetStatus, userId) {
  if (!ROLE_TRANSITIONS[role]?.[dispute.status]?.includes(targetStatus)) return false;
  if (["IN_REVIEW_GUARD", "IN_REVIEW_ADMIN"].includes(dispute.status)) {
    return dispute.assigned_handler?.user_id === userId;
  }
  return true;
}

function StaffDisputeCard({ dispute, role, userId, onOpen, onDragStart, onDragEnd }) {
  const draggable = (ROLE_TRANSITIONS[role]?.[dispute.status] || []).some((target) => (
    canMove(role, dispute, target, userId)
  ));

  return (
    <article
      className="staff-dispute-card"
      draggable={draggable}
      tabIndex={0}
      onClick={() => onOpen(dispute.dispute_id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen(dispute.dispute_id);
      }}
      onDragStart={(event) => onDragStart(event, dispute)}
      onDragEnd={onDragEnd}
    >
      <div className="staff-dispute-card-heading">
        <span>{dispute.dispute_reference}</span>
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
      <footer>
        <span><CalendarDays size={13} /> {formatMalaysiaDate(dispute.created_at)}</span>
        <span className="staff-card-handler" title={dispute.assigned_handler?.name || "Unassigned"}>
          <i>{initials(dispute.assigned_handler?.name)}</i>
          {dispute.assigned_handler?.name || "Unassigned"}
        </span>
      </footer>
      <small>Latest activity {formatMalaysiaDate(dispute.latest_activity_at, { hour: "2-digit", minute: "2-digit" })}</small>
    </article>
  );
}

export function StaffDisputesPage() {
  const { user } = useAuth();
  const columns = LIFECYCLE_COLUMNS;
  const [itemsByStatus, setItemsByStatus] = useState({});
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [issueType, setIssueType] = useState("");
  const [assignment, setAssignment] = useState("");
  const [sort, setSort] = useState("LATEST_ACTIVITY");
  const [statusView, setStatusView] = useState("");
  const [selectedDisputeId, setSelectedDisputeId] = useState(null);
  const [draggedDispute, setDraggedDispute] = useState(null);
  const [dragTarget, setDragTarget] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [error, setError] = useState("");
  const reloadTimerRef = useRef(null);
  const boardScrollRef = useRef(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const visibleColumns = useMemo(
    () => statusView ? columns.filter((column) => column.status === statusView) : columns,
    [columns, statusView]
  );

  const loadBoard = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setIsLoading(true);
    setError("");
    try {
      const results = await Promise.all(columns.map(async (column) => {
        const data = await getDisputes({
          status: column.status,
          issueType,
          search: debouncedSearch,
          assignment,
          sort,
          page: 1,
          limit: 100
        });
        return [column.status, data.disputes || []];
      }));
      setItemsByStatus(Object.fromEntries(results));
    } catch (requestError) {
      setError(requestError.message || "Unable to load operational disputes.");
    } finally {
      if (!quiet) setIsLoading(false);
    }
  }, [assignment, columns, debouncedSearch, issueType, sort]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    const socket = acquireRealtimeSocket();
    function handleDisputeChanged() {
      window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = window.setTimeout(() => void loadBoard({ quiet: true }), 150);
    }
    socket.on("dispute:changed", handleDisputeChanged);
    return () => {
      window.clearTimeout(reloadTimerRef.current);
      socket.off("dispute:changed", handleDisputeChanged);
      releaseRealtimeSocket();
    };
  }, [loadBoard]);

  function startDrag(event, dispute) {
    setDraggedDispute(dispute);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dispute.dispute_id);
  }

  function endDrag() {
    setDraggedDispute(null);
    setDragTarget("");
  }

  function scrollBoardWhileDragging(event) {
    if (!draggedDispute || !boardScrollRef.current) return;
    const board = boardScrollRef.current;
    const bounds = board.getBoundingClientRect();
    const edgeSize = 56;

    if (event.clientX < bounds.left + edgeSize) {
      board.scrollBy({ left: -18 });
    } else if (event.clientX > bounds.right - edgeSize) {
      board.scrollBy({ left: 18 });
    }
  }

  async function dropDispute(event, targetStatus) {
    event.preventDefault();
    setDragTarget("");
    const dispute = draggedDispute;
    setDraggedDispute(null);
    if (!dispute || dispute.status === targetStatus) return;
    if (!canMove(user.role, dispute, targetStatus, user.user_id)) {
      setError(`The ${disputeStatusLabel(dispute.status)} dispute cannot move to ${disputeStatusLabel(targetStatus)}.`);
      return;
    }

    const snapshot = itemsByStatus;
    const optimistic = Object.fromEntries(Object.entries(itemsByStatus).map(([status, items]) => [
      status,
      items.filter((item) => item.dispute_id !== dispute.dispute_id)
    ]));
    const moved = {
      ...dispute,
      status: targetStatus,
      assigned_handler: ["IN_REVIEW_GUARD", "IN_REVIEW_ADMIN", "RESOLVED"].includes(targetStatus)
        ? { user_id: user.user_id, name: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email, role: user.role }
        : dispute.assigned_handler
    };
    optimistic[targetStatus] = [moved, ...(optimistic[targetStatus] || [])];
    setItemsByStatus(optimistic);
    setIsTransitioning(true);
    setError("");

    try {
      await transitionDispute(dispute.dispute_id, targetStatus);
      await loadBoard({ quiet: true });
    } catch (requestError) {
      setItemsByStatus(snapshot);
      setError(requestError.message || "The dispute could not be moved. Its previous position was restored.");
    } finally {
      setIsTransitioning(false);
    }
  }

  const total = columns.reduce((sum, column) => sum + (itemsByStatus[column.status]?.length || 0), 0);

  return (
    <ProtectedLayout>
      <section className="staff-disputes-page animate-rise">
        <header className="staff-disputes-header">
          <div><span>OPERATIONS / DISPUTES</span><h1>Disputes</h1><p>Review and resolve parcel-related issues raised by Residents.</p></div>
          <div className="staff-dispute-summary"><strong>{total}</strong><span>shown</span><i /> <strong>{itemsByStatus.ESCALATED?.length || 0}</strong><span>escalated</span></div>
        </header>

        <div className="staff-dispute-toolbar">
          <label className="staff-dispute-search"><Search size={16} /><input type="search" value={search} placeholder="Search reference, tracking, courier, unit..." onChange={(event) => setSearch(event.target.value)} /></label>
          <label><Filter size={15} /><span className="sr-only">Status</span><select value={statusView} onChange={(event) => setStatusView(event.target.value)}><option value="">All statuses</option>{columns.map((column) => <option value={column.status} key={column.status}>{column.label}</option>)}</select><ChevronDown size={14} /></label>
          <label><span className="sr-only">Issue type</span><select value={issueType} onChange={(event) => setIssueType(event.target.value)}><option value="">All issue types</option>{DISPUTE_ISSUE_TYPES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select><ChevronDown size={14} /></label>
          <label><UserCheck size={15} /><span className="sr-only">Assignment</span><select value={assignment} onChange={(event) => setAssignment(event.target.value)}><option value="">All handlers</option><option value="MINE">Assigned to me</option><option value="UNASSIGNED">Unassigned</option></select><ChevronDown size={14} /></label>
          <label><span className="sr-only">Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="LATEST_ACTIVITY">Latest activity</option><option value="NEWEST">Newest</option><option value="OLDEST">Oldest</option></select><ChevronDown size={14} /></label>
          <button type="button" title="Refresh disputes" aria-label="Refresh disputes" onClick={() => loadBoard()}><RefreshCw size={16} /></button>
        </div>

        {error && <div className="dispute-message error staff-board-message" role="alert"><AlertCircle size={17} /><span>{error}</span><button type="button" onClick={() => setError("")}>Dismiss</button></div>}
        {isTransitioning && <div className="staff-board-progress" role="status"><Spinner label="Updating dispute..." /></div>}

        {isLoading ? (
          <div className="disputes-state"><Spinner label="Loading dispute board..." /></div>
        ) : (
          <div
            className="staff-kanban-scroll"
            ref={boardScrollRef}
            role="region"
            aria-label="Dispute lifecycle board"
            tabIndex={0}
            onDragOver={scrollBoardWhileDragging}
          >
            <div className={`staff-kanban-board columns-${visibleColumns.length}`}>
              {visibleColumns.map((column) => {
                const items = itemsByStatus[column.status] || [];
                const validTarget = draggedDispute && canMove(user.role, draggedDispute, column.status, user.user_id);
                return (
                  <section
                    className={`staff-kanban-column tone-${column.tone} ${dragTarget === column.status ? "drag-over" : ""} ${validTarget ? "valid-target" : ""}`}
                    onDragOver={(event) => {
                      if (validTarget) {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragTarget(column.status);
                      }
                    }}
                    onDragLeave={() => setDragTarget("")}
                    onDrop={(event) => dropDispute(event, column.status)}
                    key={column.status}
                  >
                    <header><div><i /><h2>{column.label}</h2></div><span>{items.length}</span></header>
                    <div className="staff-kanban-column-body">
                      {items.length === 0 ? <p>No {column.label.toLowerCase()} disputes.</p> : items.map((dispute) => (
                        <StaffDisputeCard
                          dispute={dispute}
                          role={user.role}
                          userId={user.user_id}
                          onOpen={setSelectedDisputeId}
                          onDragStart={startDrag}
                          onDragEnd={endDrag}
                          key={dispute.dispute_id}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {selectedDisputeId && (
        <StaffDisputeDetailModal
          disputeId={selectedDisputeId}
          onClose={() => setSelectedDisputeId(null)}
          onChanged={() => loadBoard({ quiet: true })}
        />
      )}
    </ProtectedLayout>
  );
}

import { AlertCircle, Box, Check, ChevronDown, ChevronLeft, ChevronRight, Download, FileText, Filter, LogIn, Search, Users, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { exportAuditLogs, getAuditLogs } from "../services/api.js";
import { auditDayHeading, auditDayKey, auditExportFilename, auditLabel, auditMetadataRows, auditRelativeTime, malaysiaAuditDate } from "../utils/audit.js";
import "../styles/audit-trail.css";

const DEFAULT_FILTERS = { search: "", date: "", actions: [], role: "" };

function ActionIcon({ log }) {
  const action = log.action?.toLowerCase() || "";
  const type = log.entity_type?.toUpperCase();
  const positive = /collected|resolved|activated/.test(action) && !action.includes("deactivated");
  const Icon = positive ? Check : type === "PARCEL" ? Box : type === "DISPUTE" ? AlertCircle : type === "ACCOUNT" ? Users : LogIn;
  return <span className={`audit-action-icon ${positive ? "positive" : type === "DISPUTE" ? "dispute" : "standard"}`}><Icon size={16} aria-hidden="true" /></span>;
}

function ActionFilter({ options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    function closeOutside(event) {
      if (!container.current?.contains(event.target)) setOpen(false);
    }
    function escape(event) {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="audit-action-filter" ref={container} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button className="audit-control" ref={trigger} type="button" aria-expanded={open} aria-controls="audit-action-options" onClick={() => setOpen(!open)}>
        <Filter size={15} aria-hidden="true" /> Actions {selected.length > 0 && <span className="audit-filter-count">{selected.length}</span>} <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && <fieldset className="audit-action-options" id="audit-action-options">
        <legend className="sr-only">Filter audit actions</legend>
        <div className="audit-action-options-heading"><strong>Actions</strong><button type="button" disabled={!selected.length} onClick={() => onChange([])}>Clear</button></div>
        {options.length === 0 ? <p>Actions will appear after logs load.</p> : options.map((action) => (
          <label key={action}><input type="checkbox" checked={selected.includes(action)} onChange={() => onChange(selected.includes(action) ? selected.filter((item) => item !== action) : [...selected, action])} />{auditLabel(action)}</label>
        ))}
      </fieldset>}
    </div>
  );
}

function AuditDetails({ log, onClose }) {
  const dialog = useRef(null);
  const metadata = auditMetadataRows(log.metadata);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  const details = [
    ["Date & time (Malaysia)", malaysiaAuditDate(log.created_at, { hour: "2-digit", minute: "2-digit", second: "2-digit" })],
    ["Performed by", log.actor?.name || log.actor?.email || "Not available"],
    ["Role", auditLabel(log.actor?.role)],
    ["Entity type", auditLabel(log.entity_type)],
    ["Entity reference", log.entity_reference || "Not available"],
    ["Record ID", log.entity_id || "Not available"]
  ];
  return <dialog ref={dialog} className="audit-details-dialog" aria-labelledby="audit-details-title" onCancel={onClose} onClick={(event) => {
    if (event.target === dialog.current) {
      const rect = dialog.current.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }
  }}>
    <header><div><span>ACTIVITY DETAILS</span><h2 id="audit-details-title">{auditLabel(log.action)}</h2></div><button type="button" className="audit-icon-button" autoFocus onClick={onClose} title="Close details" aria-label="Close details"><X size={18} /></button></header>
    <div className="audit-details-body">
      <dl>{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <h3>Details</h3><p>{log.description || "No description available."}</p>
      <h3>Additional information</h3>
      {metadata.length > 0 ? <dl>{metadata.map((row, index) => <div key={`${row.label}-${index}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl> : <p className="audit-muted">No additional information recorded.</p>}
    </div>
    <footer><button type="button" className="secondary-button" onClick={onClose}>Close</button></footer>
  </dialog>;
}

export function AuditTrailPage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [options, setOptions] = useState({ actions: [], roles: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportSuccess, setExportSuccess] = useState("");
  const exportController = useRef(null);
  const isAdmin = user?.role === "ADMIN";
  const hasFilters = Boolean(filters.search || filters.date || filters.actions.length || filters.role);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => current.search === search.trim() ? current : { ...current, search: search.trim() });
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setForbidden(false);
    getAuditLogs({ ...filters, page, limit }, { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      setLogs(data.audit_logs || []);
      setPagination(data.pagination);
      setOptions(data.filter_options || { actions: [], roles: [] });
    }).catch((requestError) => {
      if (controller.signal.aborted) return;
      setForbidden(requestError.status === 403);
      setError(requestError.status === 403 ? "You do not have permission to view the Audit Trail." : requestError.message || "Unable to load the Audit Trail.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [filters, page, limit, retry, user?.user_id]);

  useEffect(() => () => exportController.current?.abort(), []);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
    setExportSuccess("");
  }

  function resetFilters() {
    setSearch("");
    setFilters(DEFAULT_FILTERS);
    setPage(1);
    setExportError("");
    setExportSuccess("");
  }

  async function downloadCsv() {
    if (!isAdmin || exporting) return;
    const controller = new AbortController();
    exportController.current = controller;
    setExporting(true);
    setExportError("");
    setExportSuccess("");
    try {
      const result = await exportAuditLogs(filters, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = auditExportFilename(result.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportSuccess("CSV download started.");
    } catch (requestError) {
      if (!controller.signal.aborted) setExportError(requestError.message || "Unable to export the Audit Trail.");
    } finally {
      if (!controller.signal.aborted) setExporting(false);
    }
  }

  const groups = [];
  logs.forEach((log) => {
    const key = auditDayKey(log.created_at);
    if (groups.at(-1)?.key !== key) groups.push({ key, date: log.created_at, logs: [] });
    groups.at(-1).logs.push(log);
  });

  return <ProtectedLayout profile={user}>
    <section className="audit-page">
      <header className="audit-page-header">
        <div><span>INSIGHT / AUDIT TRAIL</span><h1>Audit Trail</h1><p>Recorded system activities, actions, and record changes.</p></div>
        {isAdmin && <button className="secondary-button audit-export-button" type="button" disabled={exporting || loading || Boolean(error) || search.trim() !== filters.search} onClick={downloadCsv}><Download size={16} aria-hidden="true" />{exporting ? "Exporting..." : "Export CSV"}</button>}
      </header>

      <div className="audit-filters" aria-label="Audit Trail filters">
        <label className="audit-search audit-control"><span className="sr-only">Search audit logs</span><Search size={17} aria-hidden="true" /><input type="search" maxLength={120} placeholder="Search tracking, unit, actor, details..." value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button type="button" title="Clear search" aria-label="Clear search" onClick={() => setSearch("")}><X size={16} /></button>}</label>
        <label className="audit-date audit-control"><span>Date</span><input aria-label="Date (Malaysia time)" type="date" value={filters.date} onChange={(event) => updateFilter("date", event.target.value)} /></label>
        <ActionFilter options={options.actions || []} selected={filters.actions} onChange={(value) => updateFilter("actions", value)} />
        <label className="audit-role audit-control"><span className="sr-only">Role</span><select aria-label="Role" value={filters.role} onChange={(event) => updateFilter("role", event.target.value)}><option value="">All Roles</option>{(options.roles || []).filter((role) => role !== "SUPER_ADMIN").map((role) => <option value={role} key={role}>{auditLabel(role)}</option>)}</select></label>
        <button className="audit-icon-button" type="button" onClick={resetFilters} disabled={!hasFilters && !search} title="Reset filters" aria-label="Reset filters"><X size={18} /></button>
      </div>

      {exportError && <div className="audit-error" role="alert">{exportError}</div>}
      {exportSuccess && <p className="audit-export-success" role="status">{exportSuccess}</p>}

      <div className="audit-log-region" aria-busy={loading}>
        <div className="audit-list-summary"><span>{loading ? "Loading activities..." : error ? "Audit Trail unavailable" : `${pagination?.total ?? 0} ${(pagination?.total ?? 0) === 1 ? "entry" : "entries"}`}</span><span>Malaysia time (MYT)</span></div>
        {loading ? <div className="audit-state" role="status"><Spinner label="Loading audit logs..." /></div> : error ? <div className="audit-state audit-error" role="alert"><AlertCircle size={25} /><h2>{forbidden ? "Access restricted" : "Unable to load activities"}</h2><p>{error}</p>{!forbidden && <button type="button" className="secondary-button" onClick={() => setRetry((value) => value + 1)}>Retry</button>}</div> : logs.length === 0 ? <div className="audit-state"><FileText size={30} /><h2>{hasFilters ? "No matching activities" : "No activities recorded yet"}</h2><p>{hasFilters ? "Try another search, date, action, or role." : "Recorded operational activities will appear here."}</p>{hasFilters && <button className="secondary-button" type="button" onClick={resetFilters}>Reset filters</button>}</div> : <table className="audit-table">
          <caption className="sr-only">Recorded operational activities in Malaysia time</caption>
          <thead><tr><th scope="col">Date & Time</th><th scope="col">Performed By / Role</th><th scope="col">Action / Entity</th><th scope="col">Details</th></tr></thead>
          {groups.map((group) => <tbody key={group.key}>
            <tr className="audit-date-group"><th colSpan={4} scope="rowgroup">{auditDayHeading(group.date)}</th></tr>
            {group.logs.map((log) => <tr key={log.audit_log_id}>
              <td data-label="Date & time"><time dateTime={log.created_at} title={malaysiaAuditDate(log.created_at, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}>{malaysiaAuditDate(log.created_at, { hour: "2-digit", minute: "2-digit", second: "2-digit", day: undefined, month: undefined, year: undefined })}</time><small>{auditRelativeTime(log.created_at)}</small></td>
              <td data-label="Performed by"><strong>{log.actor?.name || log.actor?.email || "Not available"}</strong><small>{auditLabel(log.actor?.role)}</small></td>
              <td data-label="Action"><div className="audit-action"><ActionIcon log={log} /><div><strong>{auditLabel(log.action)}</strong><small>{auditLabel(log.entity_type)}{(log.entity_reference || log.entity_id) && <> - <span className="audit-reference">{log.entity_reference || log.entity_id}</span></>}</small></div></div></td>
              <td data-label="Details"><div className="audit-row-details"><p>{log.description || "No description available."}</p><button type="button" className="audit-icon-button" title="View activity details" aria-label={`View details: ${auditLabel(log.action)} ${log.entity_reference || ""}`} onClick={() => setSelected(log)}><ChevronRight size={17} /></button></div></td>
            </tr>)}
          </tbody>)}
        </table>}
      </div>

      <footer className="audit-pagination">
        <label>Per page<select aria-label="Records per page" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></label>
        <span>{!loading && !error && pagination ? pagination.total_pages > 0 ? `${pagination.total} records - Page ${pagination.page} of ${pagination.total_pages}` : `${pagination.total} records` : ""}</span>
        <div><button className="audit-icon-button" type="button" title="Previous page" aria-label="Previous page" disabled={loading || Boolean(error) || page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={17} /></button><span className="audit-current-page" aria-current="page">{pagination?.page || page}</span><button className="audit-icon-button" type="button" title="Next page" aria-label="Next page" disabled={loading || Boolean(error) || !pagination || page >= pagination.total_pages} onClick={() => setPage(page + 1)}><ChevronRight size={17} /></button></div>
      </footer>
    </section>
    {selected && <AuditDetails log={selected} onClose={() => setSelected(null)} />}
  </ProtectedLayout>;
}

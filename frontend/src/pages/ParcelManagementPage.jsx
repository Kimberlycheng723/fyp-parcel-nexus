import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Download,
  Eye,
  Filter,
  ImagePlus,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { apiRequest } from "../services/api.js";
import { navigate } from "../utils/navigation.js";

const STATUS_OPTIONS = [
  { label: "All", value: "ALL" },
  { label: "Pending Collection", value: "PENDING_COLLECTION" },
  { label: "Overdue", value: "OVERDUE" },
  { label: "Collected", value: "COLLECTED" }
];

const DATE_RANGE_OPTIONS = [
  { label: "Last 7 days", value: "last_7_days" },
  { label: "Last 30 days", value: "last_30_days" },
  { label: "All", value: "all" }
];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
const BACKEND_BASE_URL = API_BASE_URL.replace(/\/+$/, "").replace(/\/api$/, "");

function roleCanAccess(role) {
  return role === "ADMIN" || role === "GUARD";
}

function statusMeta(parcel) {
  const displayStatus = parcel.display_status || parcel.status;

  if (displayStatus === "COLLECTED") {
    return { label: "Collected", className: "collected" };
  }

  if (displayStatus === "OVERDUE" || parcel.is_overdue) {
    return { label: "Overdue", className: "overdue" };
  }

  return { label: "Pending Collection", className: "pending" };
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatRelativeTime(value) {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "";
  }

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (seconds < 60) {
    return "Today";
  }

  const days = Math.floor(seconds / 86400);

  if (days === 0) {
    return "Today";
  }

  if (days === 1) {
    return "Yesterday";
  }

  return `${days}d ago`;
}

function courierCode(courier) {
  return (courier?.courier_code || courier?.courier_name?.slice(0, 3) || "COU").toUpperCase();
}

function courierBadgeStyle(courier) {
  return {
    backgroundColor: courier?.badge_color || "#EF4444",
    color: courier?.badge_color === "#F4B400" ? "#111820" : "#fff"
  };
}

function userName(user) {
  if (!user) {
    return "-";
  }

  return `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.email || user.role || "-";
}

function searchText(value) {
  return String(value || "").trim().toLowerCase();
}

function parcelMatchesSearchFields(parcel, term) {
  const query = searchText(term);

  if (!query) {
    return true;
  }

  return [
    parcel.tracking_number,
    parcel.unit?.full_unit_code,
    parcel.courier?.courier_name,
    parcel.courier?.courier_code
  ].some((value) => searchText(value).includes(query));
}

function exportRowMatchesSearchFields(row, term) {
  const query = searchText(term);

  if (!query) {
    return true;
  }

  return [
    row.tracking_number,
    row.unit_full_code,
    row.courier_name,
    row.courier_code
  ].some((value) => searchText(value).includes(query));
}

function getUploadUrl(parcelPhotoUrl) {
  const cleanedUrl = String(parcelPhotoUrl || "").trim();

  if (!cleanedUrl) {
    return "";
  }

  if (/^https?:\/\//i.test(cleanedUrl)) {
    return cleanedUrl;
  }

  return `${BACKEND_BASE_URL}/${cleanedUrl.replace(/^\/+/, "")}`;
}

function csvEscape(value) {
  const text = String(value ?? "");

  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }

  return text;
}

function exportCsv(rows) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const csv = [headers, ...rows.map((row) => headers.map((header) => row[header]))]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "parcel-nexus-parcels.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toDatetimeLocal(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

export function ParcelManagementPage() {
  const { user } = useAuth();
  const canAccess = roleCanAccess(user?.role);
  const isAdmin = user?.role === "ADMIN";
  const isGuard = user?.role === "GUARD";
  const [summary, setSummary] = useState(null);
  const [parcels, setParcels] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [dateRange, setDateRange] = useState("last_7_days");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isLoadingParcels, setIsLoadingParcels] = useState(false);
  const [toast, setToast] = useState(null);
  const [openFilter, setOpenFilter] = useState(null);
  const [detailsParcel, setDetailsParcel] = useState(null);
  const [editingParcel, setEditingParcel] = useState(null);
  const [deletingParcel, setDeletingParcel] = useState(null);

  const activeFilterText = useMemo(() => {
    const selectedDate = DATE_RANGE_OPTIONS.find((option) => option.value === dateRange)?.label || "All";
    return `${search || status !== "ALL" ? "FILTERS ACTIVE" : "NO FILTERS ACTIVE"} · SHOWING REGISTERED: ${selectedDate.toUpperCase()}`;
  }, [dateRange, search, status]);

  function showToast(message, type = "success") {
    setToast({ id: Date.now(), message, type });
  }

  async function loadSummary() {
    if (!canAccess) {
      return;
    }

    setIsLoadingSummary(true);

    try {
      const data = await apiRequest("/parcels/summary");
      setSummary(data);
    } catch (error) {
      showToast(error.message || "Unable to load parcel summary.", "error");
    } finally {
      setIsLoadingSummary(false);
    }
  }

  async function loadParcels() {
    if (!canAccess) {
      return;
    }

    setIsLoadingParcels(true);

    try {
      const query = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        status,
        date_range: dateRange
      });

      if (search.trim()) {
        query.set("search", search.trim());
      }

      const data = await apiRequest(`/parcels?${query.toString()}`);
      const serverParcels = data.data || [];
      const visibleParcels = search.trim()
        ? serverParcels.filter((parcel) => parcelMatchesSearchFields(parcel, search))
        : serverParcels;

      setParcels(visibleParcels);

      if (search.trim() && visibleParcels.length !== serverParcels.length) {
        setPagination({
          ...(data.pagination || {}),
          page: 1,
          total: visibleParcels.length,
          total_pages: visibleParcels.length > 0 ? 1 : 0,
          has_next: false,
          has_prev: false
        });
      } else {
        setPagination(data.pagination || null);
      }
    } catch (error) {
      showToast(error.message || "Unable to load parcel records.", "error");
    } finally {
      setIsLoadingParcels(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, [canAccess]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadParcels();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [canAccess, search, status, dateRange, page, limit]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!openFilter) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!event.target.closest(".parcel-filter-dropdown")) {
        setOpenFilter(null);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpenFilter(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openFilter]);

  function resetFilters() {
    setSearch("");
    setStatus("ALL");
    setDateRange("last_7_days");
    setPage(1);
  }

  async function refreshAfterAction(message) {
    showToast(message);
    await loadSummary();
    await loadParcels();
  }

  async function handleView(parcel) {
    try {
      const data = await apiRequest(`/parcels/${parcel.parcel_id}`);
      setDetailsParcel(data.parcel);
    } catch (error) {
      showToast(error.message || "Unable to load parcel details.", "error");
    }
  }

  async function handleExport() {
    try {
      const query = new URLSearchParams({
        status,
        date_range: dateRange
      });

      if (search.trim()) {
        query.set("search", search.trim());
      }

      const data = await apiRequest(`/parcels/export?${query.toString()}`);

      const exportRows = search.trim()
        ? (data.data || []).filter((row) => exportRowMatchesSearchFields(row, search))
        : (data.data || []);

      if (!exportRows.length) {
        showToast("No parcel records available to export.", "error");
        return;
      }

      exportCsv(exportRows);
      showToast("Parcel CSV export downloaded.");
    } catch (error) {
      showToast(error.message || "Unable to export parcel records.", "error");
    }
  }

  if (!canAccess) {
    return (
      <ProtectedLayout>
        <main className="parcel-management-page animate-rise">
          <div className="access-denied-card">
            <h1>Access denied</h1>
            <p>Parcel management is available only to Admin and Guard users.</p>
            <button className="primary-button compact-action" type="button" onClick={() => navigate("/profile")}>
              Back to profile
            </button>
          </div>
        </main>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout hideTopActions>
      <main className="parcel-management-page animate-rise">
        <header className="parcel-management-header">
          <div className="page-heading parcel-management-heading">
            <span>OPERATIONS / PARCELS</span>
            <h1>Parcels</h1>
            <p>View and manage all parcel records across GEM Condominium.</p>
          </div>

          {(isAdmin || isGuard) && (
            <div className="parcel-management-actions">
              {isGuard && (
                <>
                  <button className="dark-action-button" type="button" onClick={() => showToast("Verify Collection will be implemented in the Parcel Collection Module.", "info")}>
                    / Verify Collection
                  </button>
                  <button className="dark-action-button" type="button" onClick={() => navigate("/parcels/new")}>
                    <Plus size={16} /> Log new parcel
                  </button>
                </>
              )}
              <button className="parcel-page-bell" type="button" aria-label="Notifications">
                <Bell size={16} />
                <i />
              </button>
            </div>
          )}
        </header>

        <SummaryCards summary={summary} isLoading={isLoadingSummary} />

        <section className="parcel-management-toolbar">
          <label className="parcel-management-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by tracking number, unit number or courier"
            />
          </label>

          <FilterDropdown
            id="status"
            icon={Filter}
            label="Status:"
            options={STATUS_OPTIONS}
            value={status}
            openFilter={openFilter}
            setOpenFilter={setOpenFilter}
            onChange={(nextStatus) => {
              setStatus(nextStatus);
              setPage(1);
            }}
          />

          <FilterDropdown
            id="date-range"
            icon={CalendarDays}
            options={DATE_RANGE_OPTIONS}
            value={dateRange}
            openFilter={openFilter}
            setOpenFilter={setOpenFilter}
            onChange={(nextDateRange) => {
              setDateRange(nextDateRange);
              setPage(1);
            }}
          />

          <button className="parcel-reset-button" type="button" onClick={resetFilters} title="Reset filters" aria-label="Reset filters">
            <X size={15} /> <span className="parcel-action-label">Reset</span>
          </button>

          {isAdmin && (
            <div className="parcel-toolbar-actions">
              <button className="secondary-button" type="button" onClick={handleExport} title="Export CSV" aria-label="Export CSV">
                <Download size={16} /> <span className="parcel-action-label">Export CSV</span>
              </button>
            </div>
          )}
        </section>

        <p className="parcel-filter-note">{activeFilterText}</p>

        <ParcelTable
          parcels={parcels}
          pagination={pagination}
          limit={limit}
          isLoading={isLoadingParcels}
          isAdmin={isAdmin}
          dateRange={DATE_RANGE_OPTIONS.find((option) => option.value === dateRange)?.label || "All"}
          onView={handleView}
          onEdit={setEditingParcel}
          onDelete={setDeletingParcel}
          onPageChange={setPage}
          onLimitChange={(nextLimit) => {
            setLimit(nextLimit);
            setPage(1);
          }}
        />

        {toast && (
          <ParcelToast
            type={toast.type}
            message={toast.message}
            onClose={() => setToast(null)}
          />
        )}
      </main>

      {detailsParcel && (
        <ParcelDetailsModal parcel={detailsParcel} onClose={() => setDetailsParcel(null)} />
      )}

      {editingParcel && (
        <ParcelEditModal
          parcel={editingParcel}
          onClose={() => setEditingParcel(null)}
          onSaved={async () => {
            setEditingParcel(null);
            await refreshAfterAction("Parcel record updated successfully.");
          }}
          onError={(message) => showToast(message, "error")}
        />
      )}

      {deletingParcel && (
        <DeleteParcelModal
          parcel={deletingParcel}
          onClose={() => setDeletingParcel(null)}
          onDeleted={async () => {
            setDeletingParcel(null);
            await refreshAfterAction("Parcel record removed from the active list.");
          }}
          onError={(message) => showToast(message, "error")}
        />
      )}
    </ProtectedLayout>
  );
}

function SummaryCards({ summary, isLoading }) {
  const cards = [
    { label: "TOTAL PARCELS LOGGED", value: summary?.total_parcels, helper: "all active records" },
    { label: "PENDING COLLECTION", value: summary?.pending_collection_parcels, helper: "current waiting pickup", dot: "amber" },
    { label: "TOTAL PARCELS COLLECTED", value: summary?.collected_parcels, helper: "all collected records", dot: "green" },
    { label: "OVERDUE PARCELS", value: summary?.overdue_parcels, helper: "current past deadline", dot: "red" }
  ];

  return (
    <section className="parcel-summary-grid">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article className="parcel-summary-card" key={card.label}>
            <span className="parcel-summary-label">
              {card.dot && <i className={card.dot} />}
              {card.label}
            </span>
            {isLoading ? (
              <strong className="parcel-summary-loading">...</strong>
            ) : (
              <strong>{card.value ?? 0}</strong>
            )}
            <small>{Icon && <Icon size={13} />} {card.helper}</small>
          </article>
        );
      })}
    </section>
  );
}

function ParcelTable({
  parcels,
  pagination,
  limit,
  isLoading,
  isAdmin,
  dateRange,
  onView,
  onEdit,
  onDelete,
  onPageChange,
  onLimitChange
}) {
  const total = pagination?.total ?? parcels.length;
  const page = pagination?.page ?? 1;
  const totalPages = pagination?.total_pages ?? 1;
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <section className="parcel-table-card">
      <div className="parcel-table-topline">
        <strong>{total} parcels</strong>
        <span> · {dateRange.toLowerCase()}</span>
      </div>

      <div className="parcel-table-scroll">
        <table className="parcel-management-table">
          <thead>
            <tr>
              <th>DATE REGISTERED</th>
              <th>TRACKING NUMBER</th>
              <th>UNIT</th>
              <th>COURIER</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="parcel-empty-cell">
                  <Spinner label="Loading parcels" />
                </td>
              </tr>
            )}

            {!isLoading && parcels.length === 0 && (
              <tr>
                <td colSpan={6} className="parcel-empty-cell">
                  <strong>No parcels found.</strong>
                  <span>Adjust filters or register a new parcel session.</span>
                </td>
              </tr>
            )}

            {!isLoading && parcels.map((parcel) => (
              <tr key={parcel.parcel_id}>
                <td>
                  <div className="parcel-date-cell">
                    <strong>{formatDate(parcel.created_at)}</strong>
                    <span>{formatRelativeTime(parcel.created_at)} · {formatTime(parcel.created_at)}</span>
                  </div>
                </td>
                <td className="parcel-tracking-cell">{parcel.tracking_number}</td>
                <td><span className="parcel-unit-chip">{parcel.unit?.full_unit_code || "-"}</span></td>
                <td>
                  <div className="parcel-courier-cell">
                    <span style={courierBadgeStyle(parcel.courier)}>{courierCode(parcel.courier)}</span>
                    <strong>{parcel.courier?.courier_name || "-"}</strong>
                  </div>
                </td>
                <td><ParcelStatusBadge parcel={parcel} /></td>
                <td>
                  <div className="parcel-row-actions">
                    <button type="button" onClick={() => onView(parcel)} title="View details">
                      <Eye size={15} />
                    </button>
                    <button type="button" onClick={() => onEdit(parcel)} title="Edit parcel">
                      <Pencil size={15} />
                    </button>
                    {isAdmin && (
                      <button type="button" onClick={() => onDelete(parcel)} title="Delete parcel">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="parcel-mobile-card-list" aria-label="Parcel records">
        {isLoading && (
          <div className="parcel-mobile-empty">
            <Spinner label="Loading parcels" />
          </div>
        )}

        {!isLoading && parcels.length === 0 && (
          <div className="parcel-mobile-empty">
            <strong>No parcels found.</strong>
            <span>Adjust filters or register a new parcel session.</span>
          </div>
        )}

        {!isLoading && parcels.map((parcel) => (
          <article className="parcel-mobile-card" key={parcel.parcel_id}>
            <div className="parcel-mobile-card-header">
              <strong title={parcel.tracking_number}>{parcel.tracking_number}</strong>
              <ParcelStatusBadge parcel={parcel} />
            </div>

            <dl className="parcel-mobile-details">
              <div>
                <dt>Unit</dt>
                <dd>{parcel.unit?.full_unit_code || "-"}</dd>
              </div>
              <div>
                <dt>Courier</dt>
                <dd>{parcel.courier?.courier_name || "-"}</dd>
              </div>
              <div>
                <dt>Registered</dt>
                <dd>{formatDate(parcel.created_at)}{formatTime(parcel.created_at) ? ` · ${formatTime(parcel.created_at)}` : ""}</dd>
              </div>
            </dl>

            <div className="parcel-mobile-actions">
              <button type="button" onClick={() => onView(parcel)}>
                <Eye size={14} /> View
              </button>
              <button type="button" onClick={() => onEdit(parcel)}>
                <Pencil size={14} /> Edit
              </button>
              {isAdmin && (
                <button type="button" className="danger" onClick={() => onDelete(parcel)}>
                  <Trash2 size={14} /> Delete
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      <footer className="parcel-table-footer">
        <span>Showing <strong>{start}-{end}</strong> of {total}</span>
        {total > 0 && (
          <div className="parcel-pagination">
            <button type="button" disabled={!pagination?.has_prev} onClick={() => onPageChange(page - 1)}>‹</button>
            <button type="button" className="active">{page}</button>
            {page + 1 <= totalPages && <button type="button" onClick={() => onPageChange(page + 1)}>{page + 1}</button>}
            {page + 2 <= totalPages && <button type="button" onClick={() => onPageChange(page + 2)}>{page + 2}</button>}
            {page + 3 < totalPages && <span>...</span>}
            {totalPages > page + 2 && <button type="button" onClick={() => onPageChange(totalPages)}>{totalPages}</button>}
            <button type="button" disabled={!pagination?.has_next} onClick={() => onPageChange(page + 1)}>›</button>
          </div>
        )}
        <label className="parcel-rows-select">
          Rows
          <select value={limit} onChange={(event) => onLimitChange(Number(event.target.value))}>
            {[5, 10, 20].map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </footer>
    </section>
  );
}

function FilterDropdown({
  id,
  icon: Icon,
  label,
  options,
  value,
  openFilter,
  setOpenFilter,
  onChange
}) {
  const isOpen = openFilter === id;
  const selectedOption = options.find((option) => option.value === value) || options[0];

  return (
    <div className="parcel-filter-dropdown">
      <button
        className={`parcel-filter-trigger ${isOpen ? "open" : ""}`}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setOpenFilter(isOpen ? null : id)}
      >
        <Icon size={15} />
        {label && <span>{label}</span>}
        <strong>{selectedOption.label}</strong>
        <ChevronDown size={14} />
      </button>

      {isOpen && (
        <div className="parcel-filter-menu" role="listbox">
          {options.map((option) => (
            <button
              className={option.value === value ? "active" : ""}
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpenFilter(null);
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ParcelStatusBadge({ parcel }) {
  const meta = statusMeta(parcel);
  return <span className={`parcel-status-badge ${meta.className}`}>{meta.label}</span>;
}

function ParcelToast({ type = "success", message, onClose }) {
  return (
    <div className={`parcel-management-toast ${type}`} role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="Close notification">
        <X size={14} />
      </button>
    </div>
  );
}

function ParcelDetailsModal({ parcel, onClose }) {
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [resolvedPhotoUrl, setResolvedPhotoUrl] = useState("");
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const parcelPhotoUrl = String(parcel?.parcel_photo_url || "").trim();
  const builtPhotoUrl = getUploadUrl(parcelPhotoUrl);

  useEffect(() => {
    setPhotoLoadFailed(false);
    setResolvedPhotoUrl("");

    if (!parcelPhotoUrl || !builtPhotoUrl) {
      setIsPhotoLoading(false);
      return undefined;
    }

    let objectUrl = "";
    let isMounted = true;

    async function loadPhoto() {
      setIsPhotoLoading(true);

      try {
        const response = await fetch(builtPhotoUrl, { mode: "cors" });

        if (!response.ok) {
          throw new Error("Photo request failed.");
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (isMounted) {
          setResolvedPhotoUrl(objectUrl);
          setPhotoLoadFailed(false);
        }
      } catch {
        if (isMounted) {
          setPhotoLoadFailed(true);
        }
      } finally {
        if (isMounted) {
          setIsPhotoLoading(false);
        }
      }
    }

    loadPhoto();

    return () => {
      isMounted = false;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [parcel?.parcel_id, parcelPhotoUrl, builtPhotoUrl]);

  function handleClose() {
    setPhotoLoadFailed(false);
    setResolvedPhotoUrl("");
    onClose();
  }

  return (
    <div className="modal-backdrop parcel-management-modal-backdrop">
      <section className="parcel-management-modal parcel-details-modal animate-modal">
        <header>
          <div>
            <h2>Parcel details</h2>
            <p>{parcel.tracking_number}</p>
          </div>
          <button type="button" onClick={handleClose} aria-label="Close details">
            <X size={19} />
          </button>
        </header>

        <div className="parcel-management-details-grid">
          <div className={`parcel-photo-preview ${!parcelPhotoUrl || photoLoadFailed ? "empty" : ""}`}>
            {!parcelPhotoUrl ? (
              <span><Package size={24} /> No photo uploaded</span>
            ) : photoLoadFailed ? (
              <span><Package size={24} /> Photo unavailable</span>
            ) : isPhotoLoading || !resolvedPhotoUrl ? (
              <span><Package size={24} /> Loading photo...</span>
            ) : (
              <img
                src={resolvedPhotoUrl}
                data-original-src={builtPhotoUrl}
                alt="Parcel"
                onError={() => setPhotoLoadFailed(true)}
              />
            )}
          </div>

          <div className="parcel-detail-list">
            <DetailRow label="Status" value={<ParcelStatusBadge parcel={parcel} />} />
            <DetailRow label="Unit" value={parcel.unit?.full_unit_code || "-"} />
            <DetailRow label="Courier" value={`${courierCode(parcel.courier)} · ${parcel.courier?.courier_name || "-"}`} />
            <DetailRow label="Registered by" value={`${userName(parcel.registered_by_user)} (${parcel.registered_by_user?.email || "-"})`} />
            <DetailRow label="Delivery contact" value={parcel.delivery_person_contact || "-"} />
            <DetailRow label="Registered date" value={`${formatDate(parcel.created_at)} · ${formatTime(parcel.created_at)}`} />
            <DetailRow label="Collection deadline" value={parcel.collection_deadline ? `${formatDate(parcel.collection_deadline)} · ${formatTime(parcel.collection_deadline)}` : "-"} />
          </div>
        </div>
      </section>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="parcel-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ParcelEditModal({ parcel, onClose, onSaved, onError }) {
  const [trackingNumber, setTrackingNumber] = useState(parcel.tracking_number || "");
  const [deliveryContact, setDeliveryContact] = useState(parcel.delivery_person_contact || "");
  const [selectedCourierId, setSelectedCourierId] = useState(parcel.courier?.courier_id || parcel.courier_id || "");
  const [selectedUnit, setSelectedUnit] = useState(parcel.unit || null);
  const [unitSearch, setUnitSearch] = useState(parcel.unit?.full_unit_code || "");
  const [couriers, setCouriers] = useState([]);
  const [unitResults, setUnitResults] = useState([]);
  const [isCourierOpen, setIsCourierOpen] = useState(false);
  const [isUnitOpen, setIsUnitOpen] = useState(false);
  const [isLoadingCouriers, setIsLoadingCouriers] = useState(false);
  const [isSearchingUnits, setIsSearchingUnits] = useState(false);
  const [collectionDeadline, setCollectionDeadline] = useState(toDatetimeLocal(parcel.collection_deadline));
  const [photoValue, setPhotoValue] = useState(parcel.parcel_photo_url || null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [isLoadingExistingPhoto, setIsLoadingExistingPhoto] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const fileInputRef = useRef(null);
  const objectUrlRef = useRef("");

  const selectedCourier = useMemo(
    () => couriers.find((courier) => courier.courier_id === selectedCourierId) || parcel.courier,
    [couriers, selectedCourierId, parcel.courier]
  );
  const hasPhoto = Boolean(String(photoValue || "").trim());

  useEffect(() => {
    let isMounted = true;

    async function loadCouriers() {
      setIsLoadingCouriers(true);

      try {
        const data = await apiRequest("/couriers");

        if (isMounted) {
          setCouriers(data.couriers || data.data || []);
        }
      } catch (error) {
        if (isMounted) {
          setFormError(error.message || "Unable to load courier companies.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingCouriers(false);
        }
      }
    }

    loadCouriers();

    return () => {
      isMounted = false;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = "";
    }

    setPhotoPreview("");
    setPhotoLoadFailed(false);

    const currentPhotoUrl = String(photoValue || "").trim();
    const builtPhotoUrl = getUploadUrl(currentPhotoUrl);

    if (!currentPhotoUrl || !builtPhotoUrl) {
      setIsLoadingExistingPhoto(false);
      return undefined;
    }

    let objectUrl = "";
    let isMounted = true;

    async function loadExistingPhoto() {
      setIsLoadingExistingPhoto(true);

      try {
        const response = await fetch(builtPhotoUrl, { mode: "cors" });

        if (!response.ok) {
          throw new Error("Photo request failed.");
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (isMounted) {
          objectUrlRef.current = objectUrl;
          setPhotoPreview(objectUrl);
          setPhotoLoadFailed(false);
        }
      } catch {
        if (isMounted) {
          setPhotoLoadFailed(true);
        }
      } finally {
        if (isMounted) {
          setIsLoadingExistingPhoto(false);
        }
      }
    }

    loadExistingPhoto();

    return () => {
      isMounted = false;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [parcel.parcel_id, photoValue]);

  async function loadUnitSuggestions(searchText = "-") {
    setIsSearchingUnits(true);

    try {
      const data = await apiRequest(`/units/search?search=${encodeURIComponent(searchText)}`);
      setUnitResults(data.units || data.data || []);
    } catch (error) {
      setUnitResults([]);
      setFormError(error.message || "Unable to search units.");
    } finally {
      setIsSearchingUnits(false);
    }
  }

  function selectUnit(unit) {
    setSelectedUnit(unit);
    setUnitSearch(unit.full_unit_code);
    setIsUnitOpen(false);
    setFormError("");
  }

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    objectUrlRef.current = previewUrl;
    setPhotoPreview(previewUrl);
    setPhotoLoadFailed(false);
    setIsLoadingExistingPhoto(false);
    setIsUploadingPhoto(true);
    setFormError("");

    const formData = new FormData();
    formData.append("photo", file);

    try {
      const data = await apiRequest("/parcel-registration/photos", {
        method: "POST",
        body: formData
      });
      const uploadedPhoto = data.photo || data;
      setPhotoValue(uploadedPhoto.parcel_photo_url);
    } catch (error) {
      setPhotoValue(parcel.parcel_photo_url || null);
      setPhotoPreview("");
      setFormError(error.message || "Photo upload failed. Please try again.");
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = "";
      }
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function removePhoto() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = "";
    }

    setPhotoValue(null);
    setPhotoPreview("");
    setPhotoLoadFailed(false);
    setIsLoadingExistingPhoto(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError("");

    if (!trackingNumber.trim()) {
      setFormError("Tracking number is required.");
      return;
    }

    if (!selectedUnit?.unit_id) {
      setFormError("Please select a valid existing unit.");
      return;
    }

    if (!selectedCourierId) {
      setFormError("Please select a courier company.");
      return;
    }

    if (!deliveryContact.trim()) {
      setFormError("Delivery contact is required.");
      return;
    }

    setIsSaving(true);

    try {
      await apiRequest(`/parcels/${parcel.parcel_id}`, {
        method: "PATCH",
        body: {
          tracking_number: trackingNumber.trim(),
          unit_id: selectedUnit.unit_id,
          courier_id: selectedCourierId,
          delivery_person_contact: deliveryContact.trim(),
          collection_deadline: collectionDeadline ? new Date(collectionDeadline).toISOString() : null,
          parcel_photo_url: photoValue || null
        }
      });
      await onSaved();
    } catch (error) {
      const message = error.message || "Unable to update parcel.";
      setFormError(message);
      onError(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-backdrop parcel-management-modal-backdrop parcel-edit-modal-backdrop">
      <form className="parcel-management-modal parcel-edit-modal animate-modal" onSubmit={handleSubmit}>
        <header>
          <div>
            <h2>Edit parcel</h2>
            <p>Correct parcel registration details when needed.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close edit modal">
            <X size={19} />
          </button>
        </header>

        {formError && <p className="form-error compact">{formError}</p>}

        <div className="parcel-edit-body">
          <label className="parcel-modal-field">
            <span>Tracking number <em>*</em></span>
            <input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} />
          </label>

          <label className="parcel-modal-field unit-edit-field">
            <span>Unit number <em>*</em></span>
            <div className="parcel-modal-input-icon">
              <Search size={15} />
              <input
                value={unitSearch}
                onFocus={() => {
                  setIsUnitOpen(true);
                  if (unitResults.length === 0) {
                    loadUnitSuggestions(unitSearch.trim() || "-");
                  }
                }}
                onChange={(event) => {
                  setUnitSearch(event.target.value);
                  setIsUnitOpen(true);
                  if (selectedUnit?.full_unit_code !== event.target.value) {
                    setSelectedUnit(null);
                  }
                }}
                placeholder="Search by unit number"
              />
            </div>
            {isUnitOpen && (
              <div className="parcel-modal-dropdown unit">
                {isSearchingUnits ? (
                  <span>Searching units...</span>
                ) : unitResults.length > 0 ? (
                  unitResults.map((unit) => (
                    <button type="button" key={unit.unit_id} onClick={() => selectUnit(unit)}>
                      <strong>{unit.full_unit_code}</strong>
                      <small>{unit.resident_status ? unit.resident_status.replaceAll("_", " ").toLowerCase() : "unit record"}</small>
                    </button>
                  ))
                ) : (
                  <span>Unit not found. Please ask Admin to create the resident/unit account first.</span>
                )}
              </div>
            )}
          </label>

          <div className="parcel-modal-field courier-edit-field">
            <span>Courier <em>*</em></span>
            <button
              className="parcel-modal-select"
              type="button"
              onClick={() => setIsCourierOpen((current) => !current)}
            >
              {selectedCourier ? (
                <>
                  <b style={courierBadgeStyle(selectedCourier)}>{courierCode(selectedCourier)}</b>
                  <strong>{selectedCourier.courier_name}</strong>
                </>
              ) : (
                <small>{isLoadingCouriers ? "Loading couriers..." : "Select courier"}</small>
              )}
              <ChevronDown size={15} />
            </button>
            {isCourierOpen && (
              <div className="parcel-modal-dropdown courier">
                {couriers.map((courier) => (
                  <button
                    type="button"
                    key={courier.courier_id}
                    onClick={() => {
                      setSelectedCourierId(courier.courier_id);
                      setIsCourierOpen(false);
                    }}
                  >
                    <b style={courierBadgeStyle(courier)}>{courierCode(courier)}</b>
                    <strong>{courier.courier_name}</strong>
                  </button>
                ))}
              </div>
            )}
          </div>

          <label className="parcel-modal-field">
            <span>Delivery contact <em>*</em></span>
            <input value={deliveryContact} onChange={(event) => setDeliveryContact(event.target.value)} />
          </label>

          <label className="parcel-modal-field">
            <span>Collection deadline</span>
            <input className="parcel-deadline-input" type="datetime-local" value={collectionDeadline} onChange={(event) => setCollectionDeadline(event.target.value)} />
            <small>Overdue is calculated automatically from this deadline.</small>
          </label>

          <div className="parcel-edit-status">
            <span>Status</span>
            <ParcelStatusBadge parcel={parcel} />
            <small>Status is display-only here. Collection verification will handle collected parcels later.</small>
          </div>

          <div className="parcel-edit-photo">
            <span>Parcel photo</span>
            <input
              ref={fileInputRef}
              className="hidden-file-input"
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              capture="environment"
              onChange={handlePhotoChange}
            />
            <div className={`parcel-edit-photo-box ${photoPreview && !photoLoadFailed ? "has-photo" : ""}`}>
              {!hasPhoto ? (
                <span><Package size={20} /> No photo uploaded</span>
              ) : photoLoadFailed ? (
                <span><Package size={20} /> Photo unavailable</span>
              ) : isLoadingExistingPhoto || !photoPreview ? (
                <span><Package size={20} /> Loading photo...</span>
              ) : (
                <img src={photoPreview} alt="Parcel preview" onError={() => setPhotoLoadFailed(true)} />
              )}
            </div>
            <div className="parcel-edit-photo-actions">
              <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploadingPhoto}>
                <ImagePlus size={15} /> {isUploadingPhoto ? "Uploading..." : hasPhoto ? "Replace photo" : "Add photo"}
              </button>
              {hasPhoto && (
                <button className="secondary-button danger-lite" type="button" onClick={removePhoto}>
                  <Trash2 size={15} /> Remove photo
                </button>
              )}
            </div>
          </div>
        </div>

        <footer>
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="dark-action-button" type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function DeleteParcelModal({ parcel, onClose, onDeleted, onError }) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);

    try {
      await apiRequest(`/parcels/${parcel.parcel_id}`, {
        method: "DELETE"
      });
      await onDeleted();
    } catch (error) {
      onError(error.message || "Unable to delete parcel.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="modal-backdrop parcel-management-modal-backdrop">
      <section className="parcel-management-modal parcel-confirm-modal animate-modal">
        <span className="parcel-confirm-icon"><XCircle size={30} /></span>
        <h2>Delete parcel record?</h2>
        <p>This parcel record will be removed from the parcel list.</p>
        <div>
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="danger-confirm-button" type="button" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete parcel"}
          </button>
        </div>
      </section>
    </div>
  );
}

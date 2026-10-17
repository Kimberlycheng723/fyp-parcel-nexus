import {
  Building2,
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
import { useSearchQuery } from '../hooks/useSearchQuery.js';
import { ParcelDetailsDialog } from "../components/ParcelDetailsDialog.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { apiRequest, getParcelRooms, getActiveParcelRooms, getParcelRegistrationPhoto } from "../services/api.js";
import { parcelRoomCsvValue, parcelRoomLabel, parcelRoomUpdate } from "../utils/parcelRooms.js";
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

function csvEscape(value) {
  const text = String(value ?? "");

  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }

  return text;
}

function exportCsv(rows) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const csv = [headers.map((header) => header === "parcel_room_name" ? "Parcel Room" : header),
    ...rows.map((row) => headers.map((header) => header === "parcel_room_name" ? parcelRoomCsvValue(row[header]) : row[header]))]
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
  const [parcels, setParcels] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [status, setStatus] = useState(() => new URLSearchParams(window.location.search).get('status') === 'OVERDUE' ? 'OVERDUE' : 'ALL');
  const [dateRange, setDateRange] = useState(() => { const params = new URLSearchParams(window.location.search); return params.get('search') || params.get('date_range') === 'all' ? 'all' : 'last_7_days'; });
  const [roomFilter, setRoomFilter] = useState("");
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState("");
  const parcelRequestRef = useRef(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useSearchQuery({ setPage, setDateRange });
  const [limit, setLimit] = useState(5);
  const [isLoadingParcels, setIsLoadingParcels] = useState(false);
  const [toast, setToast] = useState(null);
  const [openFilter, setOpenFilter] = useState(null);
  const [detailsParcel, setDetailsParcel] = useState(null);
  const [editingParcel, setEditingParcel] = useState(null);
  const [deletingParcel, setDeletingParcel] = useState(null);

  const activeFilterText = useMemo(() => {
    const selectedDate = DATE_RANGE_OPTIONS.find((option) => option.value === dateRange)?.label || "All";
    return `${search || status !== "ALL" || roomFilter ? "FILTERS ACTIVE" : "NO FILTERS ACTIVE"} · SHOWING REGISTERED: ${selectedDate.toUpperCase()}`;
  }, [dateRange, search, status, roomFilter]);

  async function loadRooms() {
    setRoomsLoading(true);
    setRoomsError("");
    try {
      const data = await getParcelRooms();
      setRooms(data.parcel_rooms || []);
    } catch (error) {
      setRoomsError(error.message || "Unable to load parcel rooms.");
    } finally {
      setRoomsLoading(false);
    }
  }

  useEffect(() => { if (canAccess) loadRooms(); }, [canAccess]);

  function showToast(message, type = "success") {
    setToast({ id: Date.now(), message, type });
  }

  async function loadParcels() {
    if (!canAccess) {
      return;
    }

    const requestId = ++parcelRequestRef.current;
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
      if (roomFilter) query.set("parcel_room_id", roomFilter);

      const data = await apiRequest(`/parcels?${query.toString()}`);
      if (requestId !== parcelRequestRef.current) return;
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
      if (requestId === parcelRequestRef.current) showToast(error.message || "Unable to load parcel records.", "error");
    } finally {
      if (requestId === parcelRequestRef.current) setIsLoadingParcels(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadParcels();
    }, 250);

    return () => { window.clearTimeout(timer); parcelRequestRef.current += 1; };
  }, [canAccess, search, status, dateRange, roomFilter, page, limit]);

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
    setRoomFilter("");
    setPage(1);
  }

  async function refreshAfterAction(message) {
    showToast(message);
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
      if (roomFilter) query.set("parcel_room_id", roomFilter);

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
        {isGuard && <header className="workspace-page-actions">
          {isGuard && (
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
            </div>
          )}
        </header>}

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

        <div className="parcel-room-filter-row">
          <Building2 size={16} aria-hidden="true" />
          <label htmlFor="parcel-room-filter">Parcel Room</label>
          <select id="parcel-room-filter" value={roomFilter} onChange={(event) => { setRoomFilter(event.target.value); setPage(1); }}>
            <option value="">All Rooms</option>
            <option value="unassigned">Not Assigned</option>
            {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}{room.is_active ? "" : " (inactive)"}</option>)}
          </select>
          {roomsLoading && <span role="status">Loading rooms...</span>}
          {roomsError && <><span role="alert">{roomsError}</span><button className="secondary-button" type="button" onClick={loadRooms}>Retry</button></>}
        </div>

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
        <ParcelDetailsDialog parcel={detailsParcel} onClose={() => setDetailsParcel(null)} />
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
              <th>PARCEL ROOM</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="parcel-empty-cell">
                  <Spinner label="Loading parcels" />
                </td>
              </tr>
            )}

            {!isLoading && parcels.length === 0 && (
              <tr>
                <td colSpan={7} className="parcel-empty-cell">
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
                <td className="parcel-room-cell">{parcelRoomLabel(parcel)}</td>
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
              <div><dt>Parcel Room</dt><dd>{parcelRoomLabel(parcel)}</dd></div>
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
function ParcelEditModal({ parcel, onClose, onSaved, onError }) {
  const [activeRooms, setActiveRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState("");
  const roomRequestRef = useRef(0);
  const savingRef = useRef(false);
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

  async function loadActiveRooms() {
    const requestId = ++roomRequestRef.current;
    setRoomsLoading(true);
    setRoomsError("");
    try {
      const data = await getActiveParcelRooms();
      if (requestId === roomRequestRef.current) setActiveRooms((data.parcel_rooms || []).filter((room) => room.is_active === true));
    } catch (error) {
      if (requestId === roomRequestRef.current) setRoomsError(error.message || "Unable to load active parcel rooms.");
    } finally {
      if (requestId === roomRequestRef.current) setRoomsLoading(false);
    }
  }

  useEffect(() => {
    loadActiveRooms();
    return () => { roomRequestRef.current += 1; };
  }, []);

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
    if (!currentPhotoUrl) {
      setIsLoadingExistingPhoto(false);
      return undefined;
    }

    let objectUrl = "";
    let isMounted = true;
    const controller = new AbortController();

    async function loadExistingPhoto() {
      setIsLoadingExistingPhoto(true);

      try {
        const { blob } = await getParcelRegistrationPhoto(currentPhotoUrl, { signal: controller.signal });
        objectUrl = URL.createObjectURL(blob);

        if (isMounted) {
          objectUrlRef.current = objectUrl;
          setPhotoPreview(objectUrl);
          setPhotoLoadFailed(false);
        } else URL.revokeObjectURL(objectUrl);
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
      controller.abort();

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
    if (savingRef.current || isUploadingPhoto) return;
    setFormError("");
    const roomResult = parcelRoomUpdate(parcel, selectedRoomId, activeRooms);
    if (roomResult.error || (selectedRoomId && (roomsLoading || roomsError))) {
      setFormError(roomResult.error || "Wait for active rooms to load, or keep the current assignment.");
      return;
    }

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

    savingRef.current = true;
    setIsSaving(true);

    try {
      // Only changed fields are sent: a room-only edit must not rewrite stale parcel data.
      const body = { ...roomResult.updates };
      if (trackingNumber.trim() !== parcel.tracking_number) body.tracking_number = trackingNumber.trim();
      if (selectedUnit.unit_id !== parcel.unit_id) body.unit_id = selectedUnit.unit_id;
      if (selectedCourierId !== parcel.courier_id) body.courier_id = selectedCourierId;
      if (deliveryContact.trim() !== parcel.delivery_person_contact) body.delivery_person_contact = deliveryContact.trim();
      if (collectionDeadline !== toDatetimeLocal(parcel.collection_deadline)) body.collection_deadline = collectionDeadline ? new Date(collectionDeadline).toISOString() : null;
      if ((photoValue || null) !== (parcel.parcel_photo_url || null)) body.parcel_photo_url = photoValue || null;
      if (Object.keys(body).length) await apiRequest(`/parcels/${parcel.parcel_id}`, { method: "PATCH", body });
      await onSaved();
    } catch (error) {
      const message = error.message || "Unable to update parcel.";
      setFormError(message);
      onError(message);
      if (selectedRoomId) await loadActiveRooms();
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-backdrop parcel-management-modal-backdrop parcel-edit-modal-backdrop">
      <form className="parcel-management-modal parcel-edit-modal animate-modal" role="dialog" aria-modal="true" aria-labelledby="parcel-edit-title" onSubmit={handleSubmit}>
        <header>
          <div>
            <h2 id="parcel-edit-title">Edit parcel</h2>
            <p>Correct parcel registration details when needed.</p>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="Close edit modal">
            <X size={19} />
          </button>
        </header>

        {formError && <p className="form-error compact">{formError}</p>}

        <fieldset className="parcel-edit-body" disabled={isSaving}>
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

          <div className="parcel-modal-field parcel-room-edit-field">
            <label htmlFor="edit-parcel-room">Parcel Room</label>
            <small>Current: {parcelRoomLabel(parcel)}</small>
            <select id="edit-parcel-room" value={selectedRoomId} disabled={roomsLoading || Boolean(roomsError)}
              onChange={(event) => { setSelectedRoomId(event.target.value); setFormError(""); }}>
              <option value="">Keep current assignment</option>
              {selectedRoomId && !activeRooms.some((room) => room.id === selectedRoomId) && <option value={selectedRoomId} disabled>Selected room is no longer available</option>}
              {activeRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
            {roomsLoading && <small role="status">Loading active rooms...</small>}
            {!roomsLoading && !roomsError && activeRooms.length === 0 && <small>No active rooms available. The current assignment will be kept.</small>}
            {roomsError && <small role="alert">{roomsError}</small>}
            {selectedRoomId && <button className="secondary-button parcel-room-refresh" type="button" onClick={() => { setSelectedRoomId(""); setFormError(""); }}>
              <X size={14} /> Keep current assignment
            </button>}
            <button className="secondary-button parcel-room-refresh" type="button" disabled={roomsLoading} onClick={loadActiveRooms}>{roomsError ? "Retry loading rooms" : "Refresh rooms"}</button>
          </div>

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
        </fieldset>

        <footer>
          <button className="secondary-button" type="button" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button className="dark-action-button" type="submit" disabled={isSaving || isUploadingPhoto || Boolean(selectedRoomId && (roomsLoading || roomsError))}>
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

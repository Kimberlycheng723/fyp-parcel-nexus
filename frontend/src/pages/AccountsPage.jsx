import {
  Check,
  ChevronDown,
  Download,
  Eye,
  Filter,
  Lock,
  Mail,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Users,
  X,
  XCircle
} from "lucide-react";
import { useEffect, useState } from "react";

import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { apiRequest } from "../services/api.js";
import { navigate } from "../utils/navigation.js";

const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Active", value: "ACTIVE" },
  { label: "Pending Activation", value: "PENDING_ACTIVATION" },
  { label: "Deactivated", value: "DEACTIVATED" }
];

const ROLE_LABELS = {
  ADMIN: "Admin",
  GUARD: "Guard",
  RESIDENT: "Resident",
  SUPER_ADMIN: "Super Admin"
};

function emptyCreateForm(role) {
  return {
    role,
    fullName: "",
    first_name: "",
    last_name: "",
    email: "",
    phone_number: "",
    full_unit_code: "",
    createAnother: false
  };
}

function splitFullName(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(" ")
  };
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
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
    return "just now";
  }

  const units = [
    { suffix: "y", seconds: 60 * 60 * 24 * 365 },
    { suffix: "mo", seconds: 60 * 60 * 24 * 30 },
    { suffix: "w", seconds: 60 * 60 * 24 * 7 },
    { suffix: "d", seconds: 60 * 60 * 24 },
    { suffix: "h", seconds: 60 * 60 },
    { suffix: "m", seconds: 60 }
  ];
  const unit = units.find((item) => seconds >= item.seconds);

  return `${Math.floor(seconds / unit.seconds)}${unit.suffix} ago`;
}

function csvEscape(value) {
  const text = String(value ?? "");

  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }

  return text;
}

function formatCsvTimestamp(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function buildCsvRows(role, rows) {
  return [
    [
      "user_id",
      "role",
      "email",
      "first_name",
      "last_name",
      "full_name",
      "phone_number",
      "status",
      "unit_id",
      "unit_full_code",
      "unit_block",
      "unit_floor",
      "unit_number",
      "created_by",
      "created_by_name",
      "created_by_email",
      "created_by_role",
      "created_at",
      "updated_at"
    ],
    ...rows.map((user) => [
      user.user_id,
      user.role || role,
      user.email,
      user.first_name,
      user.last_name,
      `${user.first_name || ""} ${user.last_name || ""}`.trim(),
      user.phone_number,
      user.status,
      user.unit_id,
      user.unit?.full_unit_code,
      user.unit?.block,
      user.unit?.floor,
      user.unit?.unit_number,
      user.created_by,
      creatorName(user.created_by_user),
      user.created_by_user?.email,
      user.created_by_user?.role,
      formatCsvTimestamp(user.created_at),
      formatCsvTimestamp(user.updated_at)
    ])
  ];
}

function exportAccountsCsv(role, rows) {
  const csv = buildCsvRows(role, rows)
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const roleName = role === "ADMIN" ? "admin" : role === "GUARD" ? "guard" : "resident";

  link.href = url;
  link.download = `parcel-nexus-${roleName}-accounts.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function accountName(user) {
  if (user.role === "RESIDENT") {
    return user.unit?.full_unit_code || "No unit";
  }

  const name = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return name || user.email;
}

function creatorName(creator) {
  if (!creator) {
    return "";
  }

  const name = `${creator.first_name || ""} ${creator.last_name || ""}`.trim();
  return name || ROLE_LABELS[creator.role] || creator.email || "Not available";
}

function creatorDisplay(user) {
  if (!user.created_by_user) {
    return user.created_by ? "Not available" : "System seed";
  }

  const name = creatorName(user.created_by_user);
  const email = user.created_by_user.email;

  return email ? `${name} (${email})` : name;
}

function userInitials(user) {
  const name = accountName(user);
  return name
    .split(/\s|-/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function statusMeta(status) {
  if (status === "ACTIVE") {
    return { label: "Active", className: "active" };
  }

  if (status === "PENDING_ACTIVATION") {
    return { label: "Pending activation", className: "pending" };
  }

  return { label: "Deactivated", className: "inactive" };
}

function roleDescription(role) {
  if (role === "ADMIN") {
    return "Can manage guards, residents, and daily account access.";
  }

  if (role === "GUARD") {
    return "Can log parcels, process collections, and raise disputes.";
  }

  return "Can view parcels, collect via QR, and raise disputes.";
}

export function AccountsPage() {
  const { user } = useAuth();
  const requesterRole = user?.role;
  const canAccess = requesterRole === "SUPER_ADMIN" || requesterRole === "ADMIN";
  const [activeRole, setActiveRole] = useState(requesterRole === "SUPER_ADMIN" ? "ADMIN" : "GUARD");
  const [users, setUsers] = useState([]);
  const [counts, setCounts] = useState({ ADMIN: 0, GUARD: 0, RESIDENT: 0 });
  const [pagination, setPagination] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createRole, setCreateRole] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [detailsUser, setDetailsUser] = useState(null);
  const [statusAction, setStatusAction] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);

  const visibleRoles = requesterRole === "SUPER_ADMIN" ? ["ADMIN"] : ["GUARD", "RESIDENT"];
  const description = requesterRole === "SUPER_ADMIN"
    ? "Manage admin access to the Parcel Nexus system."
    : "Manage guard and residents access to the Parcel Management System.";

  useEffect(() => {
    if (requesterRole === "SUPER_ADMIN") {
      setActiveRole("ADMIN");
    } else if (requesterRole === "ADMIN" && !["GUARD", "RESIDENT"].includes(activeRole)) {
      setActiveRole("GUARD");
    }
  }, [requesterRole, activeRole]);

  async function loadUsers(role = activeRole) {
    if (!canAccess || !role) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const query = new URLSearchParams({
        role,
        limit: "50"
      });

      if (status) {
        query.set("status", status);
      }

      if (search.trim()) {
        query.set("search", search.trim());
      }

      const data = await apiRequest(`/users?${query.toString()}`);
      setUsers(data.users || []);
      setPagination(data.pagination || null);
      setCounts((current) => ({
        ...current,
        [role]: data.pagination?.total ?? data.users?.length ?? 0
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCounts() {
    if (!canAccess) {
      return;
    }

    const results = await Promise.allSettled(
      visibleRoles.map((role) => apiRequest(`/users?role=${role}&limit=1`))
    );

    const nextCounts = {};
    results.forEach((result, index) => {
      const role = visibleRoles[index];
      nextCounts[role] = result.status === "fulfilled"
        ? result.value.pagination?.total ?? result.value.users?.length ?? 0
        : 0;
    });
    setCounts((current) => ({ ...current, ...nextCounts }));
  }

  useEffect(() => {
    if (!canAccess) {
      return;
    }

    loadUsers(activeRole);
    loadCounts();
  }, [canAccess, activeRole, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadUsers(activeRole);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!openMenuId) {
      return undefined;
    }

    function closeMenuOnOutsideClick(event) {
      if (!event.target.closest(".row-actions")) {
        setOpenMenuId(null);
      }
    }

    function closeMenuOnEscape(event) {
      if (event.key === "Escape") {
        setOpenMenuId(null);
      }
    }

    document.addEventListener("mousedown", closeMenuOnOutsideClick);
    document.addEventListener("keydown", closeMenuOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeMenuOnOutsideClick);
      document.removeEventListener("keydown", closeMenuOnEscape);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (!notice && !error) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setNotice("");
      setError("");
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [notice, error]);

  function openCreateModal() {
    setCreateRole(requesterRole === "SUPER_ADMIN" ? "ADMIN" : activeRole);
  }

  async function refreshAfterAction(message) {
    setNotice(message);
    setError("");
    setOpenMenuId(null);
    await loadUsers(activeRole);
    await loadCounts();
  }

  async function handleViewDetails(selectedUser) {
    setError("");
    setOpenMenuId(null);

    try {
      const data = await apiRequest(`/users/${selectedUser.user_id}`);
      setDetailsUser(data.user);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function handleExport() {
    if (users.length === 0) {
      setNotice("");
      setError("No records available to export.");
      return;
    }

    setError("");
    setNotice("CSV export downloaded.");
    exportAccountsCsv(activeRole, users);
  }

  if (!canAccess) {
    return (
      <ProtectedLayout>
        <main className="accounts-page animate-rise">
          <div className="access-denied-card">
            <h1>Access denied</h1>
            <p>Account management is available only to Super Admin and Admin users.</p>
            <button className="primary-button compact-action" type="button" onClick={() => navigate("/profile")}>
              Back to profile
            </button>
          </div>
        </main>
      </ProtectedLayout>
    );
  }

  return (
    <ProtectedLayout>
      <main className="accounts-page animate-rise">
        <div className="accounts-heading-row">
          <div className="page-heading accounts-heading">
            <span>DIRECTORY / ACCOUNTS</span>
            <h1>Accounts</h1>
            <p>{description}</p>
          </div>
        </div>

        {requesterRole === "SUPER_ADMIN" && (
          <div className="accounts-tabs single-tab">
            <button className="active" type="button">
              <Shield size={16} /> Admins <span>{counts.ADMIN}</span>
            </button>
          </div>
        )}

        {requesterRole === "ADMIN" && (
          <div className="accounts-tabs">
            <button className={activeRole === "GUARD" ? "active" : ""} type="button" onClick={() => setActiveRole("GUARD")}>
              <Shield size={16} /> Guards <span>{counts.GUARD}</span>
            </button>
            <button className={activeRole === "RESIDENT" ? "active" : ""} type="button" onClick={() => setActiveRole("RESIDENT")}>
              <Users size={16} /> Residents <span>{counts.RESIDENT}</span>
            </button>
          </div>
        )}

        <section className="accounts-toolbar">
          <label className="accounts-search">
            <Search size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email, or unit..."
            />
          </label>

          <label className="accounts-status-filter">
            <Filter size={16} />
            <span>Status:</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>{option.label}</option>
              ))}
            </select>
            <ChevronDown size={16} />
          </label>

          <div className="accounts-toolbar-actions">
            <button className="secondary-button" type="button" onClick={handleExport}>
              <Download size={16} /> Export
            </button>
            <button className="dark-action-button" type="button" onClick={openCreateModal}>
              <Plus size={17} /> Add new account
            </button>
          </div>
        </section>

        {(notice || error) && (
          <AccountsToast
            type={error ? "error" : "success"}
            message={error || notice}
            onClose={() => {
              setNotice("");
              setError("");
            }}
          />
        )}

        <AccountsTable
          role={activeRole}
          users={users}
          isLoading={isLoading}
          openMenuId={openMenuId}
          setOpenMenuId={setOpenMenuId}
          onEdit={setEditingUser}
          onDetails={handleViewDetails}
          onStatus={setStatusAction}
          onResend={async (selectedUser) => {
            try {
              await apiRequest(`/users/${selectedUser.user_id}/resend-activation`, { method: "POST" });
              await refreshAfterAction("Activation email resent successfully.");
            } catch (requestError) {
              setError(requestError.message);
            }
          }}
        />

        <p className="accounts-table-summary">
          Showing <strong>{users.length ? `1-${users.length}` : "0"}</strong> of {pagination?.total ?? users.length}
        </p>
      </main>

      {createRole && (
        <AccountFormModal
          mode="create"
          role={createRole}
          onClose={() => setCreateRole(null)}
          onSaved={async (message, createAnother) => {
            await refreshAfterAction(message);
            if (!createAnother) {
              setCreateRole(null);
            }
          }}
        />
      )}

      {editingUser && (
        <AccountFormModal
          mode="edit"
          role={editingUser.role}
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={async (message) => {
            await refreshAfterAction(message);
            setEditingUser(null);
          }}
        />
      )}

      {detailsUser && (
        <DetailsModal user={detailsUser} onClose={() => setDetailsUser(null)} />
      )}

      {statusAction && (
        <StatusConfirmModal
          action={statusAction.user.status === "DEACTIVATED" ? "reactivate" : "deactivate"}
          user={statusAction.user}
          onClose={() => setStatusAction(null)}
          onSaved={async (message) => {
            await refreshAfterAction(message);
            setStatusAction(null);
          }}
        />
      )}
    </ProtectedLayout>
  );
}

function AccountsToast({ type, message, onClose }) {
  return (
    <div className={`accounts-toast ${type}`} role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="Close notification">
        <X size={14} />
      </button>
    </div>
  );
}

function AccountsTable({
  role,
  users,
  isLoading,
  openMenuId,
  setOpenMenuId,
  onEdit,
  onDetails,
  onStatus,
  onResend
}) {
  const columns = role === "RESIDENT"
    ? ["UNIT", "EMAIL", "PHONE NUMBER", "STATUS", "DATE CREATED", "ACTIONS"]
    : ["NAME", "EMAIL", "PHONE NUMBER", "STATUS", "DATE CREATED", "ACTIONS"];

  return (
    <section className={`accounts-table-card ${openMenuId ? "menu-open" : ""}`}>
      <table className={`accounts-table ${role.toLowerCase()}-accounts-table`}>
        <thead>
          <tr>
            {columns.map((column) => <th key={column}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td colSpan={columns.length} className="accounts-empty">
                <Spinner label="Loading accounts" />
              </td>
            </tr>
          )}

          {!isLoading && users.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="accounts-empty">
                <strong>No {ROLE_LABELS[role]?.toLowerCase()} accounts found.</strong>
                <span>Adjust filters or create a new account.</span>
              </td>
            </tr>
          )}

          {!isLoading && users.map((user) => (
            <tr key={user.user_id}>
              {role === "RESIDENT" ? (
                <>
                  <td className="mono-strong" data-label="Unit">{user.unit?.full_unit_code || "-"}</td>
                  <td className="mono-cell" data-label="Email">{user.email}</td>
                  <td data-label="Phone number">{user.phone_number}</td>
                </>
              ) : (
                <>
                  <td data-label="Name">
                    <div className="account-name-cell">
                      <span>{userInitials(user)}</span>
                      <div>
                        <strong>{accountName(user)}</strong>
                      </div>
                    </div>
                  </td>
                  <td className="mono-cell" data-label="Email">{user.email}</td>
                  <td data-label="Phone number">{user.phone_number}</td>
                </>
              )}

              <td data-label="Status"><StatusBadge status={user.status} /></td>
	              <td data-label="Date created">
	                <div className="date-cell">
	                  <strong>{formatDate(user.created_at)}</strong>
	                  <span>{formatRelativeTime(user.created_at)}</span>
	                </div>
	              </td>
              <td data-label="Actions">
                <div className="row-actions">
                  <button className="icon-only-button" type="button" onClick={() => onEdit(user)} title="Edit account">
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-only-button"
                    type="button"
                    onClick={() => setOpenMenuId(openMenuId === user.user_id ? null : user.user_id)}
                    title="More actions"
                  >
                    <MoreHorizontal size={17} />
                  </button>
                  {openMenuId === user.user_id && (
                    <ActionsMenu
                      user={user}
                      onDetails={onDetails}
                      onEdit={onEdit}
                      onResend={onResend}
                      onStatus={onStatus}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function StatusBadge({ status }) {
  const meta = statusMeta(status);
  return <span className={`account-status-badge ${meta.className}`}>{meta.label}</span>;
}

function ActionsMenu({ user, onDetails, onEdit, onResend, onStatus }) {
  return (
    <div className="account-actions-menu">
      <button type="button" onClick={() => onDetails(user)}>
        <Eye size={17} /> View details
      </button>
      <button type="button" onClick={() => onEdit(user)}>
        <Pencil size={17} /> Edit account
      </button>
      {user.status === "PENDING_ACTIVATION" && (
        <button type="button" className="blue-menu-item" onClick={() => onResend(user)}>
          <Mail size={17} /> Resend activation email
        </button>
      )}
      <hr />
      <button type="button" className={user.status === "DEACTIVATED" ? "blue-menu-item" : "red-menu-item"} onClick={() => onStatus({ user })}>
        {user.status === "DEACTIVATED" ? <Check size={17} /> : <XCircle size={17} />}
        {user.status === "DEACTIVATED" ? "Reactivate account" : "Deactivate account"}
      </button>
    </div>
  );
}

function AccountFormModal({ mode, role, user, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    if (!user) {
      return emptyCreateForm(role);
    }

    return {
      role,
      fullName: accountName(user),
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      email: user.email || "",
      phone_number: user.phone_number || "",
      full_unit_code: user.unit?.full_unit_code || "",
      createAnother: false
    };
  });
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isCreate = mode === "create";
  const title = isCreate ? `Add New ${ROLE_LABELS[role]} Account` : `Edit ${ROLE_LABELS[role]} Account`;
  const subtitle = isCreate
    ? `Create a new ${ROLE_LABELS[role]} account. They'll receive an activation email.`
    : "Update account details.";

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function buildPayload() {
    if (role === "RESIDENT") {
      return {
        role,
        full_unit_code: form.full_unit_code.trim(),
        email: form.email.trim(),
        phone_number: form.phone_number.trim()
      };
    }

    const nameParts = isCreate ? splitFullName(form.fullName) : {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim()
    };

    if (!nameParts?.first_name || !nameParts?.last_name) {
      return { error: "Please enter both first name and last name." };
    }

    return {
      role,
      first_name: nameParts.first_name,
      last_name: nameParts.last_name,
      email: form.email.trim(),
      phone_number: form.phone_number.trim()
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const payload = buildPayload();

    if (payload.error) {
      setError(payload.error);
      return;
    }

    if (!payload.email || !payload.phone_number) {
      setError("Email and phone are required.");
      return;
    }

    if (role === "RESIDENT" && !payload.full_unit_code) {
      setError("Unit is required.");
      return;
    }

    try {
      setIsSaving(true);
      const path = isCreate ? "/users" : `/users/${user.user_id}`;
      const method = isCreate ? "POST" : "PUT";
      const data = await apiRequest(path, { method, body: payload });
      const emailFailed = data.activationEmail?.failed;
      const message = isCreate
        ? emailFailed
          ? "Account created, but activation email could not be sent. Please check SMTP settings."
          : "Account created and activation email sent."
        : "Account updated successfully.";

      await onSaved(message, form.createAnother);

      if (isCreate && form.createAnother) {
        setForm(emptyCreateForm(role));
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModalShell title={title} subtitle={subtitle} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="account-modal-grid">
          {role === "RESIDENT" ? (
            <ModalField
              label="Unit"
              required
              value={form.full_unit_code}
              placeholder="e.g. GC1-01-08"
              onChange={(value) => updateField("full_unit_code", value)}
            />
          ) : isCreate ? (
            <ModalField
              label="Full name"
              required
              value={form.fullName}
              placeholder="e.g. Ahmad Bin Ismail"
              onChange={(value) => updateField("fullName", value)}
            />
          ) : (
            <>
              <ModalField label="First name" required value={form.first_name} onChange={(value) => updateField("first_name", value)} />
              <ModalField label="Last name" required value={form.last_name} onChange={(value) => updateField("last_name", value)} />
            </>
          )}

          <ModalField
            label="Phone"
            required
            value={form.phone_number}
            placeholder="+60 12-345 6789"
            onChange={(value) => updateField("phone_number", value)}
          />
          <ModalField
            label="Email"
            required
            wide
            type="email"
            value={form.email}
            placeholder="hello_world@gmail.com"
            onChange={(value) => updateField("email", value)}
          />
        </div>

        <RoleDisplay role={role} />

        {isCreate && (
          <div className="activation-info-box">
            <Mail size={17} />
            <div>
              <strong>Activation email will be sent automatically</strong>
              <p>Recipient sets their own password using a single-use link valid for 30 days.</p>
            </div>
          </div>
        )}

        {error && <p className="form-error compact">{error}</p>}

        <div className="account-modal-footer">
          {isCreate && (
            <label className="create-another">
              <input
                type="checkbox"
                checked={form.createAnother}
                onChange={(event) => updateField("createAnother", event.target.checked)}
              />
              Create another after saving
            </label>
          )}
          <div className="modal-footer-actions">
            <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
            <button className="dark-action-button" type="submit" disabled={isSaving}>
              {isSaving ? <Spinner label="Saving" /> : <><Check size={16} /> {isCreate ? "Save & Send Activation" : "Save changes"}</>}
            </button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

function RoleDisplay({ role }) {
  return (
    <div className="role-display-box">
      <span><ShieldCheck size={18} /></span>
      <div>
        <strong>{ROLE_LABELS[role]}</strong>
        <p>{roleDescription(role)}</p>
      </div>
      <Lock size={15} />
    </div>
  );
}

function ModalField({ label, value, onChange, placeholder, type = "text", required, wide }) {
  return (
    <label className={`account-modal-field ${wide ? "wide" : ""}`}>
      <span>{label}{required && <em>*</em>}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function DetailsModal({ user, onClose }) {
  return (
    <ModalShell title="Account Details" subtitle="Safe account information only." onClose={onClose}>
      <div className="details-grid">
        <Detail label="Name" value={user.role === "RESIDENT" ? "Resident account" : accountName(user)} />
        <Detail label="Email" value={user.email} />
        <Detail label="Phone" value={user.phone_number} />
        <Detail label="Role" value={ROLE_LABELS[user.role]} />
        <Detail label="Status" value={statusMeta(user.status).label} />
	        {user.role === "RESIDENT" && <Detail label="Unit" value={user.unit?.full_unit_code || "-"} />}
	        <Detail label="Created By" value={creatorDisplay(user)} />
	        <Detail label="Created" value={formatDate(user.created_at)} />
        <Detail label="Updated" value={formatDate(user.updated_at)} />
      </div>
    </ModalShell>
  );
}

function Detail({ label, value }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function StatusConfirmModal({ action, user, onClose, onSaved }) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const isReactivate = action === "reactivate";

  async function handleConfirm() {
    setError("");

    try {
      setIsSaving(true);
      await apiRequest(`/users/${user.user_id}/status`, {
        method: "PATCH",
        body: { status: isReactivate ? "ACTIVE" : "DEACTIVATED" }
      });
      await onSaved(isReactivate ? "Account reactivated successfully." : "Account deactivated successfully.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ModalShell
      title={isReactivate ? "Reactivate account?" : "Deactivate account?"}
      subtitle={
        isReactivate
          ? "Access will be restored if the account has already been activated."
          : "This user will no longer be able to access the system."
      }
      onClose={onClose}
      compact
    >
      <div className="confirm-account-box">
        <strong>{accountName(user)}</strong>
        <span>{user.email}</span>
      </div>
      {error && <p className="form-error compact">{error}</p>}
      <div className="modal-footer-actions end">
        <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
        <button className={isReactivate ? "dark-action-button" : "danger-confirm-button"} type="button" onClick={handleConfirm} disabled={isSaving}>
          {isSaving ? <Spinner label="Saving" /> : isReactivate ? "Reactivate account" : "Deactivate account"}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, subtitle, onClose, children, compact }) {
  return (
    <div className="modal-backdrop accounts-modal-backdrop" role="presentation">
      <section className={`account-modal animate-modal ${compact ? "compact-modal" : ""}`} role="dialog" aria-modal="true">
        <div className="account-modal-heading">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="icon-only-button" type="button" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

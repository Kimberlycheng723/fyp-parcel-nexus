import {
  Bell,
  Box,
  Building2,
  ClipboardList,
  Gauge,
  LogOut,
  Menu,
  Settings,
  ScanLine,
  User,
  Users,
  AlertCircle,
  X
} from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";
import { useResidentNotifications } from "../context/ResidentNotificationContext.jsx";
import { getCurrentPath, navigate } from "../utils/navigation.js";

const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  GUARD: "Guard",
  RESIDENT: "Resident"
};

const MENU_GROUPS = {
  SUPER_ADMIN: [
    {
      label: "Directory",
      items: [
        { key: "accounts", label: "Accounts", icon: Users, path: "/accounts" }
      ]
    }
  ],
  ADMIN: [
    {
      label: "Operations",
      items: [
        { key: "dashboard", label: "Dashboard", icon: Gauge, path: "/dashboard" },
        { key: "parcels", label: "Parcels", icon: Box, path: "/parcels" },
        { key: "disputes", label: "Disputes", icon: AlertCircle, muted: true }
      ]
    },
    {
      label: "Directory",
      items: [
        { key: "accounts", label: "Accounts", icon: Users, path: "/accounts" }
      ]
    },
    {
      label: "Insight",
      items: [
        { key: "audit-log", label: "Audit Log", icon: ClipboardList, muted: true }
      ]
    },
    {
      label: "System",
      items: [
        { key: "settings", label: "Settings", icon: Settings, muted: true }
      ]
    }
  ],
  GUARD: [
    {
      label: "Operations",
      items: [
        { key: "dashboard", label: "Dashboard", icon: Gauge, path: "/dashboard" },
        { key: "parcels", label: "Parcels", icon: Box, path: "/parcels" },
        { key: "verify-collection", label: "Verify Collection", icon: ScanLine, path: "/verify-collection" },
        { key: "disputes", label: "Disputes", icon: AlertCircle, muted: true }
      ]
    },
    {
      label: "Insight",
      items: [
        { key: "audit-log", label: "Audit Log", icon: ClipboardList, muted: true }
      ]
    }
  ],
  RESIDENT: [
    {
      label: "Operations",
      items: [
        { key: "dashboard", label: "Dashboard", icon: Gauge, path: "/dashboard" }
      ]
    }
  ]
};

function initials(profile) {
  const name = displayName(profile);

  if (profile?.first_name || profile?.last_name) {
    return `${profile?.first_name?.[0] || ""}${profile?.last_name?.[0] || ""}`.toUpperCase();
  }

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function displayName(profile) {
  if (profile?.first_name || profile?.last_name) {
    return `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
  }

  if (profile?.role && ROLE_LABELS[profile.role]) {
    return ROLE_LABELS[profile.role];
  }

  return profile?.email || "User";
}

export function ProtectedLayout({ profile, children, hideTopActions = false }) {
  const { logout, user } = useAuth();
  const { unreadCount } = useResidentNotifications();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const sidebarUser = profile || user || {};
  const role = sidebarUser?.role || "ACCOUNT";
  const roleLabel = ROLE_LABELS[role] || role.replace("_", " ");
  const menuGroups = MENU_GROUPS[role] || [];
  const currentPath = getCurrentPath();
  const residentUnitCode = sidebarUser?.unit?.full_unit_code || sidebarUser?.unit_full_code;
  const mobileTitle = currentPath === "/notifications"
    ? "Notifications"
    : role === "RESIDENT"
      ? currentPath === "/dashboard"
      ? "Parcels"
      : "GEM"
      : "GEM";
  const shouldShowNotifications = ["SUPER_ADMIN", "ADMIN", "GUARD", "RESIDENT"].includes(role);

  useEffect(() => {
    function closeSidebarOnEscape(event) {
      if (event.key === "Escape") {
        setIsSidebarOpen(false);
      }
    }

    document.addEventListener("keydown", closeSidebarOnEscape);
    return () => document.removeEventListener("keydown", closeSidebarOnEscape);
  }, []);

  function handleNavigate(path) {
    if (path) {
      navigate(path);
      setIsSidebarOpen(false);
    }
  }

  function handleLogout() {
    setIsSidebarOpen(false);
    setIsLogoutModalOpen(true);
  }

  async function confirmLogout() {
    setIsLogoutModalOpen(false);
    logout();
  }

  return (
    <main className="app-shell">
      <button
        className={`sidebar-scrim ${isSidebarOpen ? "show" : ""}`}
        type="button"
        aria-label="Close menu"
        onClick={() => setIsSidebarOpen(false)}
      />

      <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <strong>GEM</strong>
          <span>{roleLabel}</span>
          <button className="sidebar-close-button" type="button" onClick={() => setIsSidebarOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {menuGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.path === currentPath || (item.path === "/parcels" && currentPath.startsWith("/parcels"));
                return (
                  <button
                    type="button"
                    className={`nav-item ${isActive ? "active" : ""} ${item.muted ? "is-muted" : ""}`}
                    title={item.title || item.label}
                    onClick={() => handleNavigate(item.path)}
                    key={item.key}
                  >
                    <Icon size={18} /> {item.label}
                    {item.count && (
                      <span className={`nav-count ${item.darkCount ? "dark" : ""}`}>
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          <div className="nav-group">
            <p>Account</p>
          </div>
          {role === "RESIDENT" && (
            <button type="button" className="nav-item is-muted" title="Dispute Management coming later">
              <AlertCircle size={18} /> Disputes
            </button>
          )}
          <button type="button" className={`nav-item ${currentPath === "/profile" ? "active" : ""}`} onClick={() => handleNavigate("/profile")}>
            <User size={18} /> Profile
          </button>
          <button type="button" className="nav-item danger" onClick={handleLogout}>
            <LogOut size={18} /> Logout
          </button>
        </nav>

        {role === "RESIDENT" && residentUnitCode ? (
          <div className="sidebar-footer resident-unit-footer">
            <span className="resident-unit-icon"><Building2 size={20} /></span>
            <div>
              <span>Unit</span>
              <strong>{residentUnitCode}</strong>
            </div>
          </div>
        ) : (
          <div className="sidebar-footer">
            <span className="avatar">{initials(sidebarUser)}</span>
            <div>
              <strong>{displayName(sidebarUser)}</strong>
              <span>{roleLabel}</span>
            </div>
          </div>
        )}
      </aside>

      <section className="workspace">
        <div className="mobile-topbar">
          <div className="mobile-topbar-brand">
            <button className="mobile-menu-button" type="button" onClick={() => setIsSidebarOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <strong>{mobileTitle}</strong>
            <span>{roleLabel}</span>
          </div>
          {shouldShowNotifications && (
            <button
              className="mobile-topbar-bell"
              type="button"
              title="Notifications"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
              onClick={() => handleNavigate("/notifications")}
            >
              <Bell size={17} />
              {unreadCount > 0 && <i className="notification-count-badge">{unreadCount > 99 ? "99+" : unreadCount}</i>}
            </button>
          )}
        </div>

        {!hideTopActions && shouldShowNotifications && (
          <div className="top-actions">
            <button
              className="icon-button"
              type="button"
              title="Notifications"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
              onClick={() => handleNavigate("/notifications")}
            >
              <Bell size={18} />
              {unreadCount > 0 && <span className="notification-count-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
            </button>
          </div>
        )}
        {children}
      </section>

      {isLogoutModalOpen && (
        <div className="modal-backdrop logout-modal-backdrop" role="presentation">
          <section className="logout-confirm-modal animate-modal" role="dialog" aria-modal="true" aria-labelledby="logout-confirm-title">
            <div className="logout-confirm-icon">
              <LogOut size={22} />
            </div>
            <h2 id="logout-confirm-title">Are you sure you want to log out?</h2>
            <div className="logout-confirm-actions">
              <button className="secondary-button" type="button" onClick={() => setIsLogoutModalOpen(false)}>
                Cancel
              </button>
              <button className="danger-confirm-button" type="button" onClick={confirmLogout}>
                Log out
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

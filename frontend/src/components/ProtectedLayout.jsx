import {
  Bell,
  Box,
  ClipboardList,
  Gauge,
  LogOut,
  Menu,
  Settings,
  User,
  Users,
  AlertCircle,
  X
} from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";
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
        { key: "dashboard", label: "Dashboard", icon: Gauge, muted: true },
        { key: "parcels", label: "Parcels", icon: Box, muted: true, count: "312" },
        { key: "disputes", label: "Disputes", icon: AlertCircle, muted: true, count: "4", darkCount: true }
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
        { key: "dashboard", label: "Dashboard", icon: Gauge, muted: true },
        { key: "parcels", label: "Parcels", icon: Box, muted: true, count: "312" },
        { key: "disputes", label: "Disputes", icon: AlertCircle, muted: true, count: "4", darkCount: true }
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
        { key: "parcels", label: "Parcels", icon: Box, muted: true, count: "3" },
        { key: "disputes", label: "Disputes", icon: AlertCircle, muted: true }
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

export function ProtectedLayout({ profile, children }) {
  const { logout, user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const sidebarUser = profile || user || {};
  const role = sidebarUser?.role || "ACCOUNT";
  const roleLabel = ROLE_LABELS[role] || role.replace("_", " ");
  const menuGroups = MENU_GROUPS[role] || [];
  const currentPath = getCurrentPath();

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
                return (
                  <button
                    type="button"
                    className={`nav-item ${item.path === currentPath ? "active" : ""} ${item.muted ? "is-muted" : ""}`}
                    title={item.title || item.label}
                    onClick={() => handleNavigate(item.path)}
                    key={item.key}
                  >
                    <Icon size={18} /> {item.label}
                    {item.count && (
                      <span className={`nav-count ${item.darkCount ? "dark" : ""}`}>{item.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          <div className="nav-group">
            <p>Account</p>
          </div>
          <button type="button" className={`nav-item ${currentPath === "/profile" ? "active" : ""}`} onClick={() => handleNavigate("/profile")}>
            <User size={18} /> Profile
          </button>
          <button type="button" className="nav-item danger" onClick={handleLogout}>
            <LogOut size={18} /> Logout
          </button>
        </nav>

        <div className="sidebar-footer">
          <span className="avatar">{initials(sidebarUser)}</span>
          <div>
            <strong>{displayName(sidebarUser)}</strong>
            <span>{roleLabel}</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <div className="mobile-topbar">
          <button className="mobile-menu-button" type="button" onClick={() => setIsSidebarOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <strong>GEM</strong>
          <span>{roleLabel}</span>
        </div>

        <div className="top-actions">
          <button className="icon-button" type="button" title="Notifications coming later">
            <Bell size={18} />
            <span />
          </button>
        </div>
        {children}
      </section>
    </main>
  );
}

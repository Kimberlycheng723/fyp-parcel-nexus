import {
  Bell,
  Box,
  ClipboardList,
  Gauge,
  LogOut,
  Settings,
  User,
  Users,
  AlertCircle
} from "lucide-react";

import { useAuth } from "../context/AuthContext.jsx";

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
        { key: "accounts", label: "Accounts", icon: Users, muted: true, title: "Coming soon" }
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
        { key: "accounts", label: "Accounts", icon: Users, muted: true, title: "Coming soon" }
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
  const first = profile?.first_name?.[0] || profile?.email?.[0] || "U";
  const last = profile?.last_name?.[0] || "";
  return `${first}${last}`.toUpperCase();
}

function displayName(profile) {
  if (profile?.first_name || profile?.last_name) {
    return `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
  }

  if (profile?.unit?.full_unit_code) {
    return profile.unit.full_unit_code;
  }

  return profile?.email || "Account";
}

export function ProtectedLayout({ profile, children }) {
  const { logout, user } = useAuth();
  const role = profile?.role || user?.role || "ACCOUNT";
  const roleLabel = ROLE_LABELS[role] || role.replace("_", " ");
  const menuGroups = MENU_GROUPS[role] || [];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <strong>GEM</strong>
          <span>{roleLabel}</span>
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
                    className={`nav-item ${item.muted ? "is-muted" : ""}`}
                    title={item.title || `${item.label} coming later`}
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
          <button type="button" className="nav-item active">
            <User size={18} /> Profile
          </button>
          <button type="button" className="nav-item danger" onClick={logout}>
            <LogOut size={18} /> Logout
          </button>
        </nav>

        <div className="sidebar-footer">
          <span className="avatar">{initials(profile)}</span>
          <div>
            <strong>{displayName(profile)}</strong>
            <span>{roleLabel}</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
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

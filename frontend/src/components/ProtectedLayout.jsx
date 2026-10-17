import {
  Package,
  Building2,
  Bot,
  ClipboardList,
  FileSearch,
  Gauge,
  LogOut,
  Settings,
  ScanLine,
  User,
  Users,
  AlertCircle,
  Menu,
  X
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useAuth } from "../context/AuthContext.jsx";
import { useResidentNotifications } from "../context/ResidentNotificationContext.jsx";
import { getCurrentPath, navigate } from "../utils/navigation.js";
import { WorkspaceHeader } from './WorkspaceHeader.jsx';
import { useSidebarIndicator } from '../hooks/useSidebarIndicator.js';
import { useWorkspaceTheme } from '../hooks/useWorkspaceTheme.js';

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
        { key: "parcels", label: "Parcels", icon: Package, path: "/parcels" },
        { key: "disputes", label: "Disputes", icon: AlertCircle, path: "/disputes" },
        { key: "parcel-trace", label: "Parcel Trace", icon: FileSearch, path: "/parcel-trace" }
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
        { key: "audit-log", label: "Audit Trail", icon: ClipboardList, path: "/audit-logs" }
      ]
    },
    {
      label: "System",
      items: [
        { key: "parcel-rooms", label: "Parcel Rooms", icon: Building2, path: "/parcel-rooms" },
        { key: "settings", label: "Settings", icon: Settings, muted: true }
      ]
    }
  ],
  GUARD: [
    {
      label: "Operations",
      items: [
        { key: "dashboard", label: "Dashboard", icon: Gauge, path: "/dashboard" },
        { key: "parcels", label: "Parcels", icon: Package, path: "/parcels" },
        { key: "verify-collection", label: "Verify Collection", icon: ScanLine, path: "/verify-collection" },
        { key: "disputes", label: "Disputes", icon: AlertCircle, path: "/disputes" },
        { key: "parcel-trace", label: "Parcel Trace", icon: FileSearch, path: "/parcel-trace" }
      ]
    },
    {
      label: "Insight",
      items: [
        { key: "audit-log", label: "Audit Trail", icon: ClipboardList, path: "/audit-logs" }
      ]
    }
  ],
  RESIDENT: [
    {
      label: "Operations",
      items: [
        { key: "dashboard", label: "Dashboard", icon: Gauge, path: "/dashboard" },
        { key: "chatbot", label: "AI Chatbot", icon: Bot, path: "/chatbot" }
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

export function ProtectedLayout({ profile, children, dashboardVariant = false }) {
  const { logout, user } = useAuth();
  const { unreadCount } = useResidentNotifications();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isRailCollapsed, setIsRailCollapsed] = useState(() => {
    try { return sessionStorage.getItem('parcel_nexus_rail') === 'collapsed'; } catch { return false; }
  });
  const navRef = useRef(null);
  const workspaceRef = useRef(null), railToggleRef = useRef(null), railPosition = useRef(null);
  useLayoutEffect(() => {
    const before = railPosition.current;
    railPosition.current = null;
    if (!before || matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const animations = [workspaceRef.current, railToggleRef.current].map((node, index) => {
      const after = node.getBoundingClientRect();
      return node.animate([{ transform: `translateX(${before[index].left - after.left}px)`, ...(index ? {} : { opacity: .92 }) }, { transform: "translateX(0)", ...(index ? {} : { opacity: 1 }) }], { duration: 280, easing: "cubic-bezier(.22,1,.36,1)" });
    });
    return () => animations.forEach((animation) => animation.cancel());
  }, [isRailCollapsed]);
  const sidebarUser = profile || user || {};
  const [theme, setTheme] = useWorkspaceTheme(sidebarUser.user_id || user?.user_id);
  const role = sidebarUser?.role || "ACCOUNT";
  const roleLabel = ROLE_LABELS[role] || role.replace("_", " ");
  const menuGroups = MENU_GROUPS[role] || [];
  const hasFlatNavigation = ["ADMIN", "GUARD", "RESIDENT"].includes(role);
  const currentPath = getCurrentPath();
  useSidebarIndicator(navRef, { path: currentPath, role, collapsed: isRailCollapsed, open: isSidebarOpen });
  useEffect(() => {
    try { sessionStorage.setItem('parcel_nexus_rail', isRailCollapsed ? 'collapsed' : 'expanded'); } catch { /* Storage is optional for navigation. */ }
  }, [isRailCollapsed]);
  const residentUnitCode = sidebarUser?.unit?.full_unit_code || sidebarUser?.unit_full_code;

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

  function renderMenuItem(item) {
    const Icon = item.icon;
    const isActive = item.path === currentPath
      || (item.path === "/parcels" && currentPath.startsWith("/parcels"))
      || (item.path === "/disputes" && currentPath.startsWith("/disputes"));
    return (
      <button
        type="button"
        className={`nav-item ${isActive ? "active" : ""} ${item.muted ? "is-muted" : ""}`}
        title={item.title || item.label}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => handleNavigate(item.path)}
        key={item.key}
      >
        <Icon size={18} /> {item.label}
        {item.count && (
          <span className={`nav-count ${item.darkCount ? "dark" : ""}`}>{item.count}</span>
        )}
      </button>
    );
  }

  return (
    <main className={`app-shell parcel-workspace-shell${dashboardVariant ? " admin-dashboard-shell" : ""}${isRailCollapsed ? " workspace-rail-collapsed" : ""}`}>
      <button
        className={`sidebar-scrim ${isSidebarOpen ? "show" : ""}`}
        type="button"
        aria-label="Close menu"
        onClick={() => setIsSidebarOpen(false)}
      />

      <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <strong>
            <button ref={railToggleRef} type="button" className="workspace-rail-toggle"
              aria-label={isRailCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={isRailCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-controls="workspace-sidebar-navigation"
              aria-expanded={!isRailCollapsed} onClick={(event) => {
                if (event.detail) railPosition.current = [workspaceRef.current.getBoundingClientRect(), railToggleRef.current.getBoundingClientRect()];
                setIsRailCollapsed((value) => !value);
              }}><Menu size={22} aria-hidden="true" /></button>
            <span className="workspace-brand-name">GEMS</span>
          </strong>
          {role !== 'ADMIN' && <span>{roleLabel}</span>}
          <button className="sidebar-close-button" type="button" onClick={() => setIsSidebarOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>


        <nav ref={navRef} id="workspace-sidebar-navigation" className="sidebar-nav" aria-label="Main navigation">
          <span className="liquid-nav-indicator" aria-hidden="true" hidden />
          {hasFlatNavigation ? menuGroups.flatMap((group) => group.items).map(renderMenuItem) : menuGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map(renderMenuItem)}
            </div>
          ))}

          {!hasFlatNavigation && <div className="nav-group">
            <p>Account</p>
          </div>}
          {role === "RESIDENT" && (
            <button
              type="button"
              className={`nav-item ${currentPath.startsWith("/disputes") ? "active" : ""}`}
              title="Disputes"
              aria-current={currentPath.startsWith('/disputes') ? 'page' : undefined}
              onClick={() => handleNavigate("/disputes")}
            >
              <AlertCircle size={18} /> Disputes
            </button>
          )}
          <button type="button" title="Profile" className={`nav-item ${currentPath === "/profile" ? "active" : ""}`} aria-current={currentPath === '/profile' ? 'page' : undefined} onClick={() => handleNavigate("/profile")}>
            <User size={18} /> Profile
          </button>
          <button type="button" title="Logout" className="nav-item danger" onClick={handleLogout}>
            <LogOut size={18} /> Logout
          </button>
        </nav>

        {role === "RESIDENT" && residentUnitCode ? (
          <div className="sidebar-footer resident-unit-footer" title={`Unit ${residentUnitCode}`}>
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

      <section ref={workspaceRef} className="workspace">
        <WorkspaceHeader path={currentPath} role={role} unreadCount={unreadCount} onOpenMenu={() => setIsSidebarOpen(true)}
          theme={theme} onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
        <div className={'workspace-page-content' + (dashboardVariant ? ' is-dashboard' : '')}>{children}</div>
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

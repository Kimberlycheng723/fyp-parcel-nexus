import {
  AlertCircle,
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MessageCircle,
  Package,
  RefreshCw
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useResidentNotifications } from "../context/ResidentNotificationContext.jsx";
import {
  getNotifications,
  getResidentParcelSummary,
  markAllNotificationsRead,
  markNotificationRead
} from "../services/api.js";
import { navigate } from "../utils/navigation.js";

const PAGE_LIMIT = 10;
const PARCEL_NOTIFICATION_TYPES = new Set(["PARCEL_ARRIVAL", "PARCEL_OVERDUE"]);
const RESIDENT_TABS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "parcels", label: "Parcels" },
  { key: "disputes", label: "Disputes" }
];
const STAFF_TABS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "disputes", label: "Disputes" }
];

function notificationTone(type) {
  if (type === "PARCEL_OVERDUE") return "overdue";
  if (type === "DISPUTE_UPDATED") return "dispute";
  return "parcel";
}

function NotificationIcon({ type }) {
  if (type === "PARCEL_OVERDUE") return <Clock3 size={18} />;
  if (type === "DISPUTE_UPDATED") return <MessageCircle size={18} />;
  return <Package size={18} />;
}

function typeBadge(type) {
  return {
    PARCEL_ARRIVAL: "Parcel",
    PARCEL_OVERDUE: "Overdue",
    DISPUTE_UPDATED: "Update"
  }[type] || "Notification";
}

function relativeTimestamp(value) {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(timestamp));
}

function localDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "earlier";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function malaysiaDateKeyFromOffset(daysAgo) {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return localDateKey(date);
}

function groupLabel(value) {
  const key = localDateKey(value);
  if (key === malaysiaDateKeyFromOffset(0)) return "Today";
  if (key === malaysiaDateKeyFromOffset(1)) return "Yesterday";
  return "Earlier";
}

function matchesTab(notification, tab) {
  if (tab === "unread") return !notification.is_read;
  if (tab === "parcels") return PARCEL_NOTIFICATION_TYPES.has(notification.type);
  if (tab === "disputes") return notification.type === "DISPUTE_UPDATED";
  return true;
}

function emptyMessage(tab) {
  return {
    all: "No notifications yet.",
    unread: "You’re all caught up.",
    parcels: "No parcel notifications.",
    disputes: "No dispute notifications."
  }[tab];
}

function notificationDestination(notification) {
  if (PARCEL_NOTIFICATION_TYPES.has(notification.type)) {
    return {
      path: "/dashboard",
      relatedParcelId: notification.related_parcel_id || null
    };
  }

  return null;
}

export function ResidentNotificationsPage() {
  const { user } = useAuth();
  const isResident = user?.role === "RESIDENT";
  const tabs = isResident ? RESIDENT_TABS : STAFF_TABS;
  const {
    latestNotification,
    markAllReadLocally,
    markOneReadLocally,
    refreshUnreadCount,
    unreadCount
  } = useResidentNotifications();
  const [activeTab, setActiveTab] = useState("all");
  const [notifications, setNotifications] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_LIMIT, total: 0, total_pages: 0 });
  const [notificationCounts, setNotificationCounts] = useState({
    all: 0,
    unread: 0,
    parcels: 0,
    disputes: 0
  });
  const [page, setPage] = useState(1);
  const [unit, setUnit] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const data = await getNotifications({
        page,
        limit: PAGE_LIMIT,
        unreadOnly: activeTab === "unread"
      });
      setNotifications(data.notifications || []);
      setPagination(data.pagination || { page, limit: PAGE_LIMIT, total: 0, total_pages: 0 });
      setNotificationCounts(data.counts || { all: 0, unread: 0, parcels: 0, disputes: 0 });
    } catch (requestError) {
      setError(requestError.message || "Unable to load notifications.");
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    if (!isResident) {
      setUnit(null);
      return undefined;
    }

    getResidentParcelSummary()
      .then((data) => setUnit(data?.unit || null))
      .catch(() => setUnit(null));
    return undefined;
  }, [isResident]);

  useEffect(() => {
    if (!latestNotification || page !== 1) return;

    setNotifications((current) => {
      if (current.some((item) => item.notification_id === latestNotification.notification_id)) {
        return current;
      }

      return [latestNotification, ...current].slice(0, PAGE_LIMIT);
    });
    setPagination((current) => ({
      ...current,
      total: Number(current.total || 0) + 1,
      total_pages: Math.max(1, Math.ceil((Number(current.total || 0) + 1) / PAGE_LIMIT))
    }));
    setNotificationCounts((current) => ({
      ...current,
      all: current.all + 1,
      unread: current.unread + 1,
      parcels: current.parcels + (PARCEL_NOTIFICATION_TYPES.has(latestNotification.type) ? 1 : 0),
      disputes: current.disputes + (latestNotification.type === "DISPUTE_UPDATED" ? 1 : 0)
    }));
  }, [latestNotification, page]);

  const visibleNotifications = useMemo(
    () => notifications.filter((notification) => matchesTab(notification, activeTab)),
    [activeTab, notifications]
  );

  const groups = useMemo(() => {
    const grouped = new Map();

    visibleNotifications.forEach((notification) => {
      const label = groupLabel(notification.created_at);
      if (!grouped.has(label)) grouped.set(label, []);
      grouped.get(label).push(notification);
    });

    return ["Today", "Yesterday", "Earlier"]
      .filter((label) => grouped.has(label))
      .map((label) => ({ label, items: grouped.get(label) }));
  }, [visibleNotifications]);

  const layoutProfile = isResident && unit
    ? { ...user, unit: { full_unit_code: unit.unit_full_code } }
    : user;

  function handleTabChange(tab) {
    setActiveTab(tab);
    setPage(1);
  }

  async function handleNotificationClick(notification) {
    if (!notification.is_read) {
      try {
        const data = await markNotificationRead(notification.notification_id);
        setNotifications((current) =>
          current.map((item) =>
            item.notification_id === notification.notification_id
              ? { ...item, ...(data.notification || {}), is_read: true }
              : item
          )
        );
        markOneReadLocally();
        setNotificationCounts((current) => ({
          ...current,
          unread: Math.max(0, current.unread - 1)
        }));
        void refreshUnreadCount();
      } catch (requestError) {
        setError(requestError.message || "Unable to mark this notification as read.");
        return;
      }
    }

    const destination = notificationDestination(notification);

    if (destination) {
      navigate(destination.path);
    }
  }

  async function handleMarkAllRead() {
    if (isMarkingAll || unreadCount === 0) return;

    setIsMarkingAll(true);
    setError("");

    try {
      await markAllNotificationsRead();
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
      setNotificationCounts((current) => ({ ...current, unread: 0 }));
      markAllReadLocally();
      void refreshUnreadCount();
      if (activeTab === "unread") {
        setNotifications([]);
        setPagination((current) => ({ ...current, total: 0, total_pages: 0 }));
      }
    } catch (requestError) {
      setError(requestError.message || "Unable to mark notifications as read.");
    } finally {
      setIsMarkingAll(false);
    }
  }

  const tabCounts = {
    all: notificationCounts.all,
    unread: notificationCounts.unread,
    parcels: notificationCounts.parcels,
    disputes: notificationCounts.disputes
  };

  return (
    <ProtectedLayout profile={layoutProfile} hideTopActions>
      <section className="notifications-page animate-rise">
        <header className="notifications-header">
          <div>
            <span>NOTIFICATIONS</span>
            <h1>Notifications</h1>
            <p>{isResident ? "Stay updated on your parcels and disputes." : "Stay updated on dispute activity."}</p>
          </div>
          <div className="notifications-header-actions">
            <button
              className="notifications-mark-all"
              type="button"
              disabled={unreadCount === 0 || isMarkingAll}
              onClick={handleMarkAllRead}
            >
              {isMarkingAll ? (
                <Spinner label="Marking..." />
              ) : (
                <>
                  <CheckCheck size={16} />
                  Mark all as read
                </>
              )}
            </button>
            <button
              className="notifications-page-bell"
              type="button"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
              title="Notifications"
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <i className="notification-count-badge">{unreadCount > 99 ? "99+" : unreadCount}</i>
              )}
            </button>
          </div>
        </header>

        <div className="notification-tabs" role="tablist" aria-label="Notification filters">
          {tabs.map((tab) => (
            <button
              className={activeTab === tab.key ? "active" : ""}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => handleTabChange(tab.key)}
              key={tab.key}
            >
              {tab.label}
              <span>{tabCounts[tab.key]}</span>
            </button>
          ))}
        </div>

        {error && (
          <div className="notifications-error" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button type="button" onClick={loadNotifications}>
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="notifications-state">
            <Spinner />
            <span>Loading notifications...</span>
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="notifications-state empty">
            <Bell size={24} />
            <strong>{emptyMessage(activeTab)}</strong>
          </div>
        ) : (
          <div className="notification-list">
            {groups.map((group) => (
              <section className="notification-group" key={group.label}>
                <h2>{group.label}</h2>
                {group.items.map((notification) => (
                  <button
                    className={`notification-row ${notification.is_read ? "read" : "unread"}`}
                    type="button"
                    onClick={() => handleNotificationClick(notification)}
                    key={notification.notification_id}
                  >
                    <span className={`notification-icon ${notificationTone(notification.type)}`}>
                      <NotificationIcon type={notification.type} />
                    </span>
                    <span className="notification-copy">
                      <span className="notification-title-line">
                        <strong>{notification.title}</strong>
                        <em className={`notification-type ${notificationTone(notification.type)}`}>
                          {typeBadge(notification.type)}
                        </em>
                        {!notification.is_read && <i aria-label="Unread notification" />}
                      </span>
                      <span>{notification.message}</span>
                    </span>
                    <time dateTime={notification.created_at}>{relativeTimestamp(notification.created_at)}</time>
                  </button>
                ))}
              </section>
            ))}
          </div>
        )}

        {!isLoading && Number(pagination.total_pages || 0) > 1 && (
          <nav className="notification-pagination" aria-label="Notification pages">
            <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              <ChevronLeft size={16} /> Previous
            </button>
            <span>Page {page} of {pagination.total_pages}</span>
            <button
              type="button"
              disabled={page >= Number(pagination.total_pages || 1)}
              onClick={() => setPage((current) => current + 1)}
            >
              Next <ChevronRight size={16} />
            </button>
          </nav>
        )}
      </section>
    </ProtectedLayout>
  );
}

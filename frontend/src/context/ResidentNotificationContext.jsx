import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

import { useAuth } from "./AuthContext.jsx";
import { getUnreadNotificationCount } from "../services/api.js";
import { acquireRealtimeSocket, releaseRealtimeSocket } from "../services/socket.js";
import { navigate } from "../utils/navigation.js";

const ResidentNotificationContext = createContext(null);
const PARCEL_NOTIFICATION_TYPES = new Set([
  "PARCEL_ARRIVAL",
  "PARCEL_OVERDUE",
  "PARCEL_COMMUNITY_ALERT"
]);

export function ResidentNotificationProvider({ children }) {
  const { token, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestNotification, setLatestNotification] = useState(null);
  const [realtimeToast, setRealtimeToast] = useState(null);
  const seenNotificationIds = useRef(new Set());
  const hasNotificationSession = Boolean(token && user?.user_id);

  const refreshUnreadCount = useCallback(async () => {
    if (!hasNotificationSession) {
      setUnreadCount(0);
      return 0;
    }

    try {
      const data = await getUnreadNotificationCount();
      const nextCount = Math.max(0, Number(data?.unread_count || 0));
      setUnreadCount(nextCount);
      return nextCount;
    } catch (error) {
      return null;
    }
  }, [hasNotificationSession]);

  useEffect(() => {
    if (!hasNotificationSession) {
      seenNotificationIds.current.clear();
      setUnreadCount(0);
      setLatestNotification(null);
      setRealtimeToast(null);
      return undefined;
    }

    void refreshUnreadCount();
    const socket = acquireRealtimeSocket();

    function handleNotificationCreated(notification) {
      const notificationId = notification?.notification_id;

      if (!notificationId || seenNotificationIds.current.has(notificationId)) {
        return;
      }

      seenNotificationIds.current.add(notificationId);
      setLatestNotification(notification);
      setUnreadCount((current) => current + 1);

      if (document.visibilityState === "visible" && document.hasFocus()) {
        setRealtimeToast(notification);
      }

      void refreshUnreadCount();
    }

    socket.on("notification:created", handleNotificationCreated);

    return () => {
      socket.off("notification:created", handleNotificationCreated);
      releaseRealtimeSocket();
    };
  }, [hasNotificationSession, refreshUnreadCount, user?.user_id]);

  useEffect(() => {
    if (!realtimeToast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setRealtimeToast(null);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [realtimeToast]);

  function handleToastClick() {
    const notification = realtimeToast;
    setRealtimeToast(null);

    if (notification && PARCEL_NOTIFICATION_TYPES.has(notification.type)) {
      navigate("/dashboard");
      return;
    }

    if (notification?.type === "DISPUTE_UPDATED") {
      navigate(user?.role === "RESIDENT" && notification.related_dispute_id
        ? `/disputes/${notification.related_dispute_id}`
        : "/disputes");
    }
  }

  const value = useMemo(
    () => ({
      unreadCount,
      latestNotification,
      refreshUnreadCount,
      markOneReadLocally() {
        setUnreadCount((current) => Math.max(0, current - 1));
      },
      markAllReadLocally() {
        setUnreadCount(0);
      }
    }),
    [latestNotification, refreshUnreadCount, unreadCount]
  );

  return (
    <ResidentNotificationContext.Provider value={value}>
      {children}
      {realtimeToast && (
        <aside
          className="resident-realtime-toast"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <button
            className="resident-realtime-toast-content"
            type="button"
            onClick={handleToastClick}
          >
            <strong>{realtimeToast.title || "New notification"}</strong>
            <span>{realtimeToast.message || "You have a new notification."}</span>
          </button>
          <button
            className="resident-realtime-toast-close"
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setRealtimeToast(null)}
          >
            <X size={16} />
          </button>
        </aside>
      )}
    </ResidentNotificationContext.Provider>
  );
}

export function useResidentNotifications() {
  const context = useContext(ResidentNotificationContext);

  if (!context) {
    throw new Error("useResidentNotifications must be used inside ResidentNotificationProvider.");
  }

  return context;
}

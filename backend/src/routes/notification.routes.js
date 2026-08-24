import { Router } from "express";

import {
  getPreferences,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updatePreferences
} from "../controllers/notification.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  getVapidPublicKey,
  subscribeBrowserPush,
  unsubscribeBrowserPush
} from "../controllers/pushSubscription.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/notifications", requireAuth, asyncHandler(listNotifications));
router.get("/notifications/unread-count", requireAuth, asyncHandler(getUnreadCount));
router.patch(
  "/notifications/read-all",
  requireAuth,
  asyncHandler(markAllNotificationsRead)
);
router.patch(
  "/notifications/:notificationId/read",
  requireAuth,
  asyncHandler(markNotificationRead)
);
router.get(
  "/notification-preferences",
  requireAuth,
  asyncHandler(getPreferences)
);
router.patch(
  "/notification-preferences",
  requireAuth,
  asyncHandler(updatePreferences)
);
router.get(
  "/push-subscriptions/vapid-public-key",
  requireAuth,
  asyncHandler(getVapidPublicKey)
);
router.post(
  "/push-subscriptions",
  requireAuth,
  asyncHandler(subscribeBrowserPush)
);
router.delete(
  "/push-subscriptions",
  requireAuth,
  asyncHandler(unsubscribeBrowserPush)
);

export default router;

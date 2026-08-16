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

export default router;

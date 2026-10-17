import { Router } from "express";

import {
  exportAdminReport,
  getAdminDashboardData,
  getGuardDashboardData
} from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getOperations, sendReminder } from "../controllers/adminOperations.controller.js";
import { getAnalytics, exportAnalytics } from "../controllers/adminAnalytics.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/admin/operations", requireRole("ADMIN"), asyncHandler(getOperations));
router.get("/admin/analytics", requireRole("ADMIN"), asyncHandler(getAnalytics));
router.get("/admin/analytics/report", requireRole("ADMIN"), asyncHandler(exportAnalytics));
router.post("/admin/parcels/:parcelId/reminder", requireRole("ADMIN"), asyncHandler(sendReminder));

router.get("/admin/reports/export", requireRole("ADMIN"), asyncHandler(exportAdminReport));
router.get("/admin", requireRole("ADMIN"), asyncHandler(getAdminDashboardData));
router.get("/guard", requireRole("GUARD"), asyncHandler(getGuardDashboardData));

export default router;

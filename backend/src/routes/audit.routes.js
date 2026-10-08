import { Router } from "express";

import { exportAuditLogs, getAuditLogs } from "../controllers/audit.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);
router.get("/export", requireRole("ADMIN"), asyncHandler(exportAuditLogs));
router.get("/", requireRole("ADMIN", "GUARD"), asyncHandler(getAuditLogs));

export default router;

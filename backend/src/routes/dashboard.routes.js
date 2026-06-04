import { Router } from "express";

import { getAdminDashboardData } from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);

router.get("/admin", requireRole("ADMIN"), asyncHandler(getAdminDashboardData));

export default router;

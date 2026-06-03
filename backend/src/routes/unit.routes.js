import { Router } from "express";

import { searchUnitsForRegistration } from "../controllers/unit.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);

router.get("/search", requireRole("ADMIN", "GUARD"), asyncHandler(searchUnitsForRegistration));

export default router;

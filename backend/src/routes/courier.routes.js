import { Router } from "express";

import { createCourierCompany, listCouriers } from "../controllers/courier.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("GUARD"));

router.get("/", asyncHandler(listCouriers));
router.post("/", asyncHandler(createCourierCompany));

export default router;

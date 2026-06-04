import { Router } from "express";

import {
  getParcel,
  getSummary,
  listParcels
} from "../controllers/residentParcel.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("RESIDENT"));

router.get("/parcels/summary", asyncHandler(getSummary));
router.get("/parcels", asyncHandler(listParcels));
router.get("/parcels/:parcelId", asyncHandler(getParcel));

export default router;

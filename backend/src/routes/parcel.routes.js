import { Router } from "express";

import {
  deleteParcelRecord,
  exportParcelRecords,
  getParcelRecord,
  getStatusOptions,
  getSummary,
  listParcelRecords,
  updateParcelRecord,
  updateParcelRecordStatus
} from "../controllers/parcel.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);

router.get("/summary", requireRole("ADMIN", "GUARD"), asyncHandler(getSummary));
router.get("/export", requireRole("ADMIN"), asyncHandler(exportParcelRecords));
router.get("/status-options", requireRole("ADMIN", "GUARD"), getStatusOptions);
router.get("/", requireRole("ADMIN", "GUARD"), asyncHandler(listParcelRecords));
router.get("/:parcelId", requireRole("ADMIN", "GUARD"), asyncHandler(getParcelRecord));
router.patch("/:parcelId/status", requireRole("ADMIN", "GUARD"), asyncHandler(updateParcelRecordStatus));
router.patch("/:parcelId", requireRole("ADMIN", "GUARD"), asyncHandler(updateParcelRecord));
router.delete("/:parcelId", requireRole("ADMIN"), asyncHandler(deleteParcelRecord));

export default router;

import { Router } from "express";

import {
  createDisputeMessageRecord,
  createDisputeRecord,
  deleteResidentDisputeRecord,
  getDisputeEvidence,
  getDisputeHistoryRecords,
  getDisputeMessageRecords,
  getDisputeRecord,
  getEligibleParcels,
  listDisputeRecords,
  transitionDisputeRecord,
  updateAdminResolutionNotesRecord,
  updateGuardResponseRecord,
  updateResidentDisputeRecord
} from "../controllers/dispute.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import {
  disputeEvidenceUpload,
  handleUploadError,
  validateDisputeEvidenceContent
} from "../middleware/upload.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("RESIDENT", "GUARD", "ADMIN"));

router.get("/eligible-parcels", requireRole("RESIDENT"), asyncHandler(getEligibleParcels));
router.post(
  "/",
  requireRole("RESIDENT"),
  disputeEvidenceUpload,
  handleUploadError,
  asyncHandler(validateDisputeEvidenceContent),
  asyncHandler(createDisputeRecord)
);
router.get("/", asyncHandler(listDisputeRecords));
router.patch(
  "/:disputeId",
  requireRole("RESIDENT"),
  disputeEvidenceUpload,
  handleUploadError,
  asyncHandler(validateDisputeEvidenceContent),
  asyncHandler(updateResidentDisputeRecord)
);
router.delete(
  "/:disputeId",
  requireRole("RESIDENT"),
  asyncHandler(deleteResidentDisputeRecord)
);
router.get("/:disputeId/history", asyncHandler(getDisputeHistoryRecords));
router.get("/:disputeId/messages", asyncHandler(getDisputeMessageRecords));
router.post("/:disputeId/messages", asyncHandler(createDisputeMessageRecord));
router.get("/:disputeId/evidence/:evidenceId", asyncHandler(getDisputeEvidence));
router.get("/:disputeId", asyncHandler(getDisputeRecord));
router.patch(
  "/:disputeId/transition",
  requireRole("GUARD", "ADMIN"),
  asyncHandler(transitionDisputeRecord)
);
router.patch(
  "/:disputeId/guard-response",
  requireRole("GUARD"),
  asyncHandler(updateGuardResponseRecord)
);
router.patch(
  "/:disputeId/admin-resolution-notes",
  requireRole("ADMIN"),
  asyncHandler(updateAdminResolutionNotesRecord)
);

export default router;

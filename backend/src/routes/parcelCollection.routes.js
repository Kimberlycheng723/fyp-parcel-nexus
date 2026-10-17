import { Router } from "express";

import {
  createCollection,
  verifyCollection
} from "../controllers/parcelCollection.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { activeVerifications, verificationDetails, verifyBarcode, uploadPhoto, collectionPhoto,
  confirmVerification, cancelVerification } from "../controllers/collectionVerification.controller.js";
import { collectionPhotoUpload, collectionUploadError, createCollectionVerificationLimiter } from "../middleware/collectionVerification.middleware.js";

const router = Router();

router.use(requireAuth);
const limitVerification = createCollectionVerificationLimiter();

router.post(
  "/resident/collections",
  requireRole("RESIDENT"),
  asyncHandler(createCollection)
);
router.post(
  "/guard/collections/verify",
  requireRole("GUARD"),
  limitVerification,
  asyncHandler(verifyCollection)
);

router.get("/resident/collection-verifications/active", requireRole("RESIDENT"), asyncHandler(activeVerifications));
router.get("/collection-verifications/:sessionId", requireRole("RESIDENT", "GUARD", "ADMIN"), asyncHandler(verificationDetails));
router.post("/collection-verifications/:sessionId/parcels/:parcelId/barcode", requireRole("RESIDENT"), limitVerification, asyncHandler(verifyBarcode));
router.put("/collection-verifications/:sessionId/parcels/:parcelId/photo", requireRole("RESIDENT"), limitVerification,
  collectionPhotoUpload, collectionUploadError, asyncHandler(uploadPhoto));
router.get("/collection-verifications/:sessionId/parcels/:parcelId/photo", requireRole("RESIDENT", "GUARD", "ADMIN"), asyncHandler(collectionPhoto));
router.post("/collection-verifications/:sessionId/confirm", requireRole("RESIDENT"), limitVerification, asyncHandler(confirmVerification));
router.post("/collection-verifications/:sessionId/cancel", requireRole("RESIDENT"), limitVerification, asyncHandler(cancelVerification));

export default router;

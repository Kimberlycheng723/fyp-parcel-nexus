import { Router } from "express";

import {
  createParcelRegistrationSession,
  uploadParcelPhoto
} from "../controllers/parcelRegistration.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { handleUploadError, parcelPhotoUpload } from "../middleware/upload.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);

router.post(
  "/photos",
  requireRole("ADMIN", "GUARD"),
  parcelPhotoUpload.single("photo"),
  handleUploadError,
  asyncHandler(uploadParcelPhoto)
);

router.post("/sessions", requireRole("GUARD"), asyncHandler(createParcelRegistrationSession));

export default router;

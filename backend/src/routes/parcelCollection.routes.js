import { Router } from "express";

import {
  createCollection,
  verifyCollection
} from "../controllers/parcelCollection.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);

router.post(
  "/resident/collections",
  requireRole("RESIDENT"),
  asyncHandler(createCollection)
);
router.post(
  "/guard/collections/verify",
  requireRole("GUARD"),
  asyncHandler(verifyCollection)
);

export default router;

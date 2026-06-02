import { Router } from "express";

import {
  changePassword,
  getProfile,
  updateOwnProfile
} from "../controllers/profile.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);

router.get("/", asyncHandler(getProfile));
router.put("/", asyncHandler(updateOwnProfile));
router.post("/change-password", asyncHandler(changePassword));

export default router;

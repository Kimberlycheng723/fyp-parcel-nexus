import { Router } from "express";

import {
  changePassword,
  confirmOwnEmailChange,
  getProfile,
  requestOwnEmailChange,
  updateOwnProfile
} from "../controllers/profile.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post("/email-change/confirm", asyncHandler(confirmOwnEmailChange));

router.use(requireAuth);

router.get("/", asyncHandler(getProfile));
router.put("/", asyncHandler(updateOwnProfile));
router.post("/email-change/request", asyncHandler(requestOwnEmailChange));
router.post("/change-password", asyncHandler(changePassword));

export default router;

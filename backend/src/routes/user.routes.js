import { Router } from "express";

import {
  createUser,
  getUser,
  listUsers,
  resendActivationEmail,
  updateUser,
  updateUserStatus
} from "../controllers/user.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.use(requireAuth);

router.post("/", asyncHandler(createUser));
router.get("/", asyncHandler(listUsers));
router.get("/:userId", asyncHandler(getUser));
router.put("/:userId", asyncHandler(updateUser));
router.patch("/:userId/status", asyncHandler(updateUserStatus));
router.post("/:userId/resend-activation", asyncHandler(resendActivationEmail));

export default router;

import { Router } from "express";

import {
  activate,
  forgotPassword,
  getCurrentUser,
  login,
  logout,
  resetPasswordWithToken
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post("/login", asyncHandler(login));
router.post("/activate", asyncHandler(activate));
router.post("/forgot-password", asyncHandler(forgotPassword));
router.post("/reset-password", asyncHandler(resetPasswordWithToken));
router.get("/me", requireAuth, asyncHandler(getCurrentUser));
router.post("/logout", requireAuth, asyncHandler(logout));

export default router;

import { Router } from "express";

import { activate, getCurrentUser, login, logout } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post("/login", asyncHandler(login));
router.post("/activate", asyncHandler(activate));
router.get("/me", requireAuth, asyncHandler(getCurrentUser));
router.post("/logout", requireAuth, logout);

export default router;

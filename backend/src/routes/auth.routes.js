import { Router } from "express";

import { getCurrentUser, login, logout } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post("/login", asyncHandler(login));
router.get("/me", requireAuth, asyncHandler(getCurrentUser));
router.post("/logout", requireAuth, logout);

export default router;

import { Router } from "express";
import { createRoom, getRoom, listActiveRooms, listRooms, updateRoom, updateRoomStatus } from "../controllers/parcelRoom.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
router.use(requireAuth);
router.use(requireRole("ADMIN", "GUARD"));
router.get("/", asyncHandler(listRooms));
router.get("/active", asyncHandler(listActiveRooms));
router.get("/:roomId", asyncHandler(getRoom));
router.post("/", requireRole("ADMIN"), asyncHandler(createRoom));
router.patch("/:roomId/status", requireRole("ADMIN"), asyncHandler(updateRoomStatus));
router.patch("/:roomId", requireRole("ADMIN"), asyncHandler(updateRoom));

export default router;

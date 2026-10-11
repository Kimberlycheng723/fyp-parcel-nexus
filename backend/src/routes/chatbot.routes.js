import express, { Router } from "express";
import { sendMessage } from "../controllers/chatbot.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../middleware/role.middleware.js";
import { chatbotErrorHandler, createChatbotLimiter } from "../middleware/chatbot.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createChatbotRouter({ authenticate = requireAuth, controller = sendMessage, limiter = createChatbotLimiter() } = {}) {
  const router = Router();
  router.post("/message", authenticate, requireRole("RESIDENT"), limiter,
    express.json({ limit: "16kb" }), asyncHandler(controller));
  router.use(chatbotErrorHandler);
  return router;
}

export default createChatbotRouter();

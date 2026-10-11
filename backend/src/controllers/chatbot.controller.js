import { pool } from "../db/pool.js";
import { createChatbotParcelTools } from "../services/chatbotParcel.service.js";
import { createChatbotService } from "../services/chatbot.service.js";

const replyToResident = createChatbotService({ executeTool: createChatbotParcelTools(pool) });

export function createChatbotController(reply = replyToResident) {
  return async (req, res) => {
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.once("close", onClose);
    try {
      const result = await reply({ requester: req.user, input: req.body, signal: controller.signal });
      if (!res.destroyed) return res.json(result);
    } finally {
      res.removeListener("close", onClose);
    }
  };
}

export const sendMessage = createChatbotController();

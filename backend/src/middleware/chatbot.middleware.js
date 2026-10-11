import { ChatbotError } from "../utils/chatbot.js";

export function createChatbotLimiter({ now = Date.now, requestsPerMinute = 10, maxConcurrent = 8, maxUsers = 2000 } = {}) {
  const users = new Map();
  let active = 0;
  return (req, res, next) => {
    const timestamp = now();
    for (const [id, entry] of users) {
      if (!entry.active && timestamp - entry.start >= 60000) users.delete(id);
    }
    const id = req.user.user_id;
    let entry = users.get(id);
    if (!entry) {
      if (users.size >= maxUsers) return next(new ChatbotError("CHATBOT_BUSY", 503, "The assistant is busy. Please try again later."));
      entry = { start: timestamp, count: 0, active: false };
      users.set(id, entry);
    }
    if (timestamp - entry.start >= 60000) {
      entry.start = timestamp;
      entry.count = 0;
    }
    if (entry.active || entry.count >= requestsPerMinute) {
      res.set("Retry-After", String(Math.max(1, Math.ceil((60000 - (timestamp - entry.start)) / 1000))));
      return next(new ChatbotError("CHATBOT_RATE_LIMITED", 429, "Please wait before sending another assistant message."));
    }
    if (active >= maxConcurrent) return next(new ChatbotError("CHATBOT_BUSY", 503, "The assistant is busy. Please try again shortly."));
    entry.count += 1;
    entry.active = true;
    active += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      entry.active = false;
      active -= 1;
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  };
}

export function chatbotErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === "entity.too.large") {
    return res.status(413).json({ code: "CHATBOT_REQUEST_TOO_LARGE", message: "Assistant request is too large (maximum 16 KB)." });
  }
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ code: "INVALID_CHATBOT_INPUT", message: "Assistant request must contain valid JSON." });
  }
  if (error instanceof ChatbotError) {
    return res.status(error.status).json({ code: error.code, message: error.message });
  }
  return res.status(500).json({ code: "CHATBOT_UNAVAILABLE", message: "Unable to process your assistant request. Please try again later." });
}

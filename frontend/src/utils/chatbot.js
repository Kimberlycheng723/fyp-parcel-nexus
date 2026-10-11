// Mirrors the existing Step 16A input contract; displayed replies remain unabridged.
export const CHATBOT_LIMITS = Object.freeze({
  message: 2000,
  historyTurns: 8,
  historyMessage: 1000,
  historyCharacters: 6000,
  replyCharacters: 6000,
  requestBytes: 16384,
  displayedMessages: 80,
  requestTimeoutMs: 45000
});

function contextText(content) {
  return content.trim().slice(0, CHATBOT_LIMITS.historyMessage).replace(/[\uD800-\uDBFF]$/, "");
}

export function buildChatbotHistory(messages, currentMessage = "") {
  const pairs = [];
  for (let index = 0; index < messages.length - 1; index += 1) {
    const question = messages[index];
    const reply = messages[index + 1];
    if (question.role !== "user" || question.status !== "answered"
      || reply.role !== "assistant" || reply.status !== "received") continue;
    const userContent = contextText(question.content);
    const assistantContent = contextText(reply.content);
    if (userContent && assistantContent) {
      pairs.push([{ role: "user", content: userContent }, { role: "assistant", content: assistantContent }]);
    }
  }
  const history = [];
  let characters = 0;
  for (const pair of pairs.reverse()) {
    const length = pair.reduce((sum, turn) => sum + turn.content.length, 0);
    if (history.length + 2 > CHATBOT_LIMITS.historyTurns || characters + length > CHATBOT_LIMITS.historyCharacters) break;
    history.unshift(...pair);
    characters += length;
  }
  // Character limits alone can exceed the JSON body limit with non-ASCII text.
  while (history.length && new TextEncoder().encode(JSON.stringify({ message: currentMessage, history })).length > CHATBOT_LIMITS.requestBytes) {
    history.splice(0, 2);
  }
  return history;
}

export function readChatbotReply(data) {
  if (typeof data?.reply !== "string" || !data.reply.trim() || data.reply.length > CHATBOT_LIMITS.replyCharacters) {
    const error = new Error("The assistant returned an unreadable response. Please try again.");
    error.code = "CHATBOT_INVALID_RESPONSE";
    error.status = 502;
    throw error;
  }
  return data.reply.trim();
}

export function retryAfterSeconds(header, now = Date.now()) {
  if (typeof header !== "string" || !header.trim()) return 10;
  const value = header.trim();
  if (/^\d+$/.test(value)) return Number.isFinite(Number(value)) ? Math.max(1, Number(value)) : 10;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1, Math.ceil((date - now) / 1000)) : 10;
}

export function chatbotErrorState(error) {
  const status = Number(error?.status);
  if (status === 401) return { message: "Your session has expired. Please log in again.", retryable: false };
  if (status === 403) return { message: "Your account does not have access to AI Chatbot.", retryable: false, denied: true };
  if (status === 429) return {
    message: "Too many requests. Please wait a moment before trying again.",
    retryable: true, retryAfter: retryAfterSeconds(error.retryAfter)
  };
  if (error?.code === "CHATBOT_INVALID_RESPONSE") return {
    message: "The assistant returned an unreadable response. Please try again.", retryable: true
  };
  if (status === 400 || status === 413) return {
    message: error.code === "INVALID_CHATBOT_INPUT" && typeof error.message === "string" && error.message.length <= 500
      ? error.message : "Please send a shorter message of up to 2000 characters.",
    retryable: false
  };
  if (status === 504) return { message: "The assistant took too long to respond. Please try again.", retryable: true };
  if (status >= 500) return {
    message: "The AI assistant is temporarily unavailable. Please try again later.", retryable: true
  };
  return { message: "Unable to connect. Please check your connection and try again.", retryable: true };
}

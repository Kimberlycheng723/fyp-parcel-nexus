import { GoogleGenAI } from "@google/genai";
import { CHATBOT_FUNCTION_DECLARATIONS } from "./chatbotParcel.service.js";
import {
  CHATBOT_LIMITS, CHATBOT_SYSTEM_INSTRUCTION, DEFAULT_GEMINI_MODEL, ChatbotError,
  validateChatbotInput
} from "../utils/chatbot.js";

function providerError(error, signal) {
  if (error instanceof ChatbotError) return error;
  const status = Number(error?.status);
  if (signal.aborted || [408, 504].includes(status) || ["AbortError", "TimeoutError"].includes(error?.name)) {
    return new ChatbotError("CHATBOT_TIMEOUT", 504, "The assistant took too long to respond. Please try again.");
  }
  if (status === 429) return new ChatbotError("GEMINI_RATE_LIMITED", 429, "The assistant's Gemini quota is temporarily exhausted. Please try again later.");
  if ([400, 401, 403, 404].includes(status)) {
    return new ChatbotError("GEMINI_CONFIGURATION_ERROR", 503, "The assistant's API key or configured model is unavailable. Please contact management.");
  }
  return new ChatbotError("GEMINI_UNAVAILABLE", 503, "The AI assistant is temporarily unavailable. Please try again later.");
}

function awaitUntilAborted(operation, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(operation).then(
      (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
      (error) => { signal.removeEventListener("abort", onAbort); reject(error); }
    );
  });
}

export function createChatbotService({
  executeTool,
  getSettings = () => ({ apiKey: process.env.GEMINI_API_KEY?.trim(), model: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL }),
  createClient = (apiKey) => new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } }),
  timeoutMs = CHATBOT_LIMITS.timeoutMs
}) {
  return async function replyToResident({ requester, input, signal: requestSignal }) {
    if (requester?.role !== "RESIDENT" || !requester.user_id) {
      throw new ChatbotError("CHATBOT_FORBIDDEN", 403, "Only Residents can use the parcel assistant.");
    }
    const { message, history } = validateChatbotInput(input);
    const { apiKey, model } = getSettings();
    if (!apiKey) throw new ChatbotError("GEMINI_NOT_CONFIGURED", 503, "The AI assistant is not configured yet. Please contact management.");
    if (typeof model !== "string" || !/^gemini-[a-z0-9.-]{1,80}$/.test(model)) {
      throw new ChatbotError("GEMINI_CONFIGURATION_ERROR", 503, "The configured Gemini model is invalid. Please contact management.");
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (requestSignal?.aborted) abort();
    requestSignal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    const signal = controller.signal;
    // History cannot inject model/tool messages or thought signatures into the SDK conversation.
    const contents = [{ role: "user", parts: [{ text: JSON.stringify({
      untrusted_conversation_history: history, current_resident_message: message
    }) }] }];
    const deadline = Date.now() + timeoutMs;
    let toolCalls = 0;
    try {
      const client = createClient(apiKey);
      for (let round = 0; round < CHATBOT_LIMITS.modelCalls; round += 1) {
        signal.throwIfAborted();
        const response = await awaitUntilAborted(client.models.generateContent({
          model, contents,
          config: {
            systemInstruction: CHATBOT_SYSTEM_INSTRUCTION,
            maxOutputTokens: CHATBOT_LIMITS.outputTokens,
            temperature: 0.2,
            tools: [{ functionDeclarations: CHATBOT_FUNCTION_DECLARATIONS }],
            toolConfig: { functionCallingConfig: { mode: toolCalls >= CHATBOT_LIMITS.toolCalls ? "NONE" : "AUTO" } },
            abortSignal: signal,
            httpOptions: { timeout: Math.max(1, deadline - Date.now()) }
          }
        }), signal);
        signal.throwIfAborted();
        const candidate = response?.candidates?.[0];
        const content = candidate?.content;
        const parts = Array.isArray(content?.parts) ? content.parts : [];
        const calls = parts.filter((part) => part.functionCall).map((part) => part.functionCall);
        if (!calls.length) {
          const reply = parts.filter((part) => !part.thought && typeof part.text === "string")
            .map((part) => part.text).join("").trim();
          if (!reply || reply.length > CHATBOT_LIMITS.replyCharacters || candidate.finishReason !== "STOP") {
            throw new ChatbotError("GEMINI_INVALID_RESPONSE", 502, "The assistant could not produce a complete answer. Please try a shorter question.");
          }
          return { reply };
        }
        if (toolCalls + calls.length > CHATBOT_LIMITS.toolCalls || round === CHATBOT_LIMITS.modelCalls - 1) {
          throw new ChatbotError("CHATBOT_TOOL_LIMIT", 502, "The question requires too many parcel lookups. Please ask a more specific question.");
        }
        const functionResponses = [];
        for (const call of calls) {
          signal.throwIfAborted();
          const result = await awaitUntilAborted(executeTool({ name: call.name, args: call.args ?? {}, requester }), signal);
          signal.throwIfAborted();
          functionResponses.push({ functionResponse: {
            name: call.name, ...(call.id ? { id: call.id } : {}), response: { result }
          } });
          toolCalls += 1;
        }
        // Keep the complete model content: newer Gemini models require original thought signatures.
        contents.push(content, { role: "user", parts: functionResponses });
      }
      throw new ChatbotError("CHATBOT_TOOL_LIMIT", 502, "Please ask a more specific parcel question.");
    } catch (error) {
      throw providerError(error, signal);
    } finally {
      clearTimeout(timer);
      requestSignal?.removeEventListener("abort", abort);
    }
  };
}

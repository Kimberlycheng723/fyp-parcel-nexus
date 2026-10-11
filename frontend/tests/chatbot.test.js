import assert from "node:assert/strict";
import test from "node:test";
import { buildChatbotHistory, chatbotErrorState, CHATBOT_LIMITS, readChatbotReply, retryAfterSeconds } from "../src/utils/chatbot.js";

function exchange(index, question = `Question ${index}`, reply = `Reply ${index}`) {
  return [
    { id: index * 2, role: "user", content: question, status: "answered" },
    { id: index * 2 + 1, role: "assistant", content: reply, status: "received" }
  ];
}

test("history keeps the latest completed exchanges in backend order with only supported fields", () => {
  const messages = Array.from({ length: 10 }, (_, index) => exchange(index)).flat();
  const history = buildChatbotHistory(messages);
  assert.equal(history.length, 8);
  assert.deepEqual(history[0], { role: "user", content: "Question 6" });
  assert.deepEqual(history[7], { role: "assistant", content: "Reply 9" });
  assert.ok(history.every((turn) => Object.keys(turn).join(",") === "role,content"));
});

test("failed, pending, and orphan messages are never sent as successful history", () => {
  const messages = [
    { role: "assistant", status: "received", content: "Orphan" },
    ...exchange(0),
    { role: "user", status: "failed", content: "Failed" },
    { role: "user", status: "pending", content: "Current question" }
  ];
  assert.deepEqual(buildChatbotHistory(messages), [
    { role: "user", content: "Question 0" }, { role: "assistant", content: "Reply 0" }
  ]);
});

test("history enforces turn, per-message and aggregate character limits without changing display messages", () => {
  const messages = Array.from({ length: 8 }, (_, index) => exchange(index, "q".repeat(2000), "a".repeat(6000))).flat();
  const history = buildChatbotHistory(messages);
  assert.equal(history.length, 6);
  assert.equal(history.reduce((sum, turn) => sum + turn.content.length, 0), 6000);
  assert.ok(history.every((turn) => turn.content.length <= 1000));
  assert.equal(messages[0].content.length, 2000);
  assert.equal(messages[1].content.length, 6000);
});

test("Unicode history and current question also respect the backend's 16 KB body limit", () => {
  const messages = Array.from({ length: 4 }, (_, index) => exchange(index, "问".repeat(1000), "答".repeat(1000))).flat();
  const message = "问".repeat(2000);
  const history = buildChatbotHistory(messages, message);
  const bytes = new TextEncoder().encode(JSON.stringify({ message, history })).length;
  assert.ok(bytes <= CHATBOT_LIMITS.requestBytes);
  assert.ok(history.length >= 2);
});

test("history truncation does not leave an unpaired Unicode surrogate", () => {
  const history = buildChatbotHistory(exchange(0, "q".repeat(999) + "😀", "a"));
  assert.equal(history[0].content, "q".repeat(999));
});

test("new conversation has no history and only successful reply strings are accepted", () => {
  assert.deepEqual(buildChatbotHistory([]), []);
  assert.equal(readChatbotReply({ reply: "  First line\nSecond line  " }), "First line\nSecond line");
  for (const data of [undefined, null, {}, { reply: [] }, { reply: " " }, { reply: "x".repeat(6001) }]) {
    assert.throws(() => readChatbotReply(data), { code: "CHATBOT_INVALID_RESPONSE", status: 502 });
  }
});

test("HTML-looking responses stay untrusted text for React to escape", () => {
  const text = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  assert.equal(readChatbotReply({ reply: text }), text);
});

test("Retry-After accepts seconds and HTTP dates and handles invalid values", () => {
  const now = Date.parse("2026-10-11T08:00:00Z");
  assert.equal(retryAfterSeconds("60", now), 60);
  assert.equal(retryAfterSeconds("0", now), 1);
  assert.equal(retryAfterSeconds("Sun, 11 Oct 2026 08:01:00 GMT", now), 60);
  assert.equal(retryAfterSeconds("Sun, 11 Oct 2026 07:00:00 GMT", now), 1);
  for (const value of [undefined, null, "", "invalid", "9".repeat(1000)]) assert.equal(retryAfterSeconds(value, now), 10);
});

test("auth, rate-limit, timeout and network errors have appropriate safe states", () => {
  assert.equal(chatbotErrorState({ status: 401 }).retryable, false);
  assert.equal(chatbotErrorState({ status: 403 }).denied, true);
  assert.equal(chatbotErrorState({ status: 429, retryAfter: "30" }).retryAfter, 30);
  assert.match(chatbotErrorState({ status: 504 }).message, /too long/);
  assert.match(chatbotErrorState(new TypeError("Failed to fetch")).message, /check your connection/);
  assert.match(chatbotErrorState({ code: "CHATBOT_INVALID_RESPONSE", status: 502 }).message, /unreadable/);
});

test("provider/configuration failures never expose raw backend errors or pretend to be AI answers", () => {
  for (const status of [500, 502, 503]) {
    const state = chatbotErrorState({ status, message: "PRIVATE database SQL / key / stack" });
    assert.equal(state.message, "The AI assistant is temporarily unavailable. Please try again later.");
    assert.equal(state.retryable, true);
  }
});

test("only known bounded backend validation messages are shown", () => {
  assert.equal(chatbotErrorState({ status: 400, code: "INVALID_CHATBOT_INPUT", message: "Provide a message of 1-2000 characters." }).message,
    "Provide a message of 1-2000 characters.");
  for (const error of [{ status: 400, message: "PRIVATE SQL" }, { status: 413, message: "raw error" },
    { status: 400, code: "INVALID_CHATBOT_INPUT", message: "x".repeat(501) }]) {
    assert.equal(chatbotErrorState(error).message, "Please send a shorter message of up to 2000 characters.");
  }
});

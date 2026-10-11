import { AlertCircle, ArrowUp, Bot, Clock3, Package, Plus, QrCode, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ProtectedLayout } from "../components/ProtectedLayout.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { sendChatbotMessage } from "../services/api.js";
import { buildChatbotHistory, chatbotErrorState, CHATBOT_LIMITS } from "../utils/chatbot.js";

const SUGGESTIONS = [
  { icon: Package, question: "How many parcels are waiting for me?" },
  { icon: QrCode, question: "How do I generate a QR code?" },
  { icon: Clock3, question: "What is the status of my latest parcel?" },
  { icon: AlertCircle, question: "How do I raise a dispute?" }
];

export function ResidentChatbotPage() {
  const { user } = useAuth();
  return (
    <ProtectedLayout>
      <ChatbotConversation key={user?.user_id} />
    </ProtectedLayout>
  );
}

function ChatbotConversation() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [failedRequest, setFailedRequest] = useState(null);
  const [isDenied, setIsDenied] = useState(false);
  const [retryUntil, setRetryUntil] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const activeRequest = useRef(null);
  const nextMessageId = useRef(0);
  const transcriptRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => () => {
    activeRequest.current?.controller.abort();
    activeRequest.current = null;
  }, []);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [messages, isSending, error]);

  useEffect(() => {
    function updateCountdown() {
      setRemainingSeconds(Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000)));
    }
    updateCountdown();
    if (retryUntil <= Date.now()) return undefined;
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [retryUntil]);

  function startNewConversation() {
    activeRequest.current?.controller.abort();
    activeRequest.current = null;
    setMessages([]);
    setDraft("");
    setFailedRequest(null);
    setError(isDenied ? { message: "Your account does not have access to AI Chatbot.", retryable: false } : null);
    setIsSending(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function submitMessage(question = draft, retry = null) {
    const message = question.trim();
    if (activeRequest.current || isDenied || Date.now() < retryUntil || !message) return;
    if (question.length > CHATBOT_LIMITS.message) {
      setError({ message: "Please keep your message within 2000 characters.", retryable: false });
      return;
    }
    const userMessageId = retry?.userMessageId ?? ++nextMessageId.current;
    const history = retry?.history ?? buildChatbotHistory(messages, message);
    const attempt = { controller: new AbortController(), timedOut: false };
    activeRequest.current = attempt;
    setIsSending(true);
    setError(null);
    setFailedRequest(null);
    setDraft("");
    if (retry) {
      setMessages((current) => current.map((item) => item.id === userMessageId ? { ...item, status: "pending" } : item));
    } else {
      setMessages((current) => [...current, { id: userMessageId, role: "user", content: message, status: "pending" }]
        .slice(-CHATBOT_LIMITS.displayedMessages));
    }
    const timeout = window.setTimeout(() => {
      attempt.timedOut = true;
      attempt.controller.abort();
    }, CHATBOT_LIMITS.requestTimeoutMs);
    try {
      const { reply } = await sendChatbotMessage({ message, history }, { signal: attempt.controller.signal });
      if (activeRequest.current !== attempt) return;
      const replyId = ++nextMessageId.current;
      setMessages((current) => [...current.map((item) => item.id === userMessageId ? { ...item, status: "answered" } : item),
        { id: replyId, role: "assistant", content: reply, status: "received" }].slice(-CHATBOT_LIMITS.displayedMessages));
    } catch (requestError) {
      if (activeRequest.current !== attempt) return;
      const state = chatbotErrorState(attempt.timedOut ? { status: 504 } : requestError);
      setMessages((current) => current.map((item) => item.id === userMessageId ? { ...item, status: "failed" } : item));
      setError(state);
      setIsDenied(Boolean(state.denied));
      setFailedRequest({ message, history, userMessageId });
      setDraft(message);
      if (state.retryAfter) setRetryUntil(Date.now() + state.retryAfter * 1000);
    } finally {
      window.clearTimeout(timeout);
      if (activeRequest.current === attempt) {
        activeRequest.current = null;
        setIsSending(false);
        window.requestAnimationFrame(() => inputRef.current?.focus());
      }
    }
  }

  function submitDraft(event) {
    event.preventDefault();
    const retry = failedRequest?.message === draft.trim() ? failedRequest : null;
    void submitMessage(draft, retry);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      submitDraft(event);
    }
  }

  const isCoolingDown = remainingSeconds > 0;
  const cannotSend = isSending || isDenied || isCoolingDown || !draft.trim() || draft.length > CHATBOT_LIMITS.message;

  return (
    <section className="chatbot-page" aria-labelledby="chatbot-title">
      <header className="chatbot-header">
        <div>
          <span>ASSISTANCE / AI CHATBOT</span>
          <h1 id="chatbot-title">AI Chatbot</h1>
          <p>Ask questions about your parcels and learn how to use Parcel Nexus.</p>
        </div>
        <button className="secondary-button chatbot-new-button" type="button" onClick={startNewConversation}
          disabled={!messages.length && !draft && !error && !isSending}>
          <Plus size={17} /> New Conversation
        </button>
      </header>

      <div className="chatbot-surface">
        <div className="chatbot-transcript" ref={transcriptRef} role="log" aria-label="Conversation" aria-live="polite"
          aria-relevant="additions text" tabIndex={0}>
          {messages.length === 0 ? (
            <section className="chatbot-welcome">
              <span className="chatbot-welcome-icon"><Bot size={29} aria-hidden="true" /></span>
              <h2>Hello! I&apos;m your Parcel Nexus AI Assistant.</h2>
              <p>I can help you check your parcel information and answer questions about using Parcel Nexus.</p>
              <div className="chatbot-suggestions">
                {SUGGESTIONS.map(({ icon: Icon, question }) => (
                  <button type="button" key={question} onClick={() => void submitMessage(question)}
                    disabled={isSending || isDenied || isCoolingDown}>
                    <Icon size={19} aria-hidden="true" />
                    <span>{question}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <div className="chatbot-message-list">
              {messages.map((message) => (
                <article className={`chatbot-message ${message.role}`} key={message.id}>
                  <span className="chatbot-sender">{message.role === "user" ? "You" : "Parcel Nexus AI"}</span>
                  <p className="chatbot-message-text">{message.content}</p>
                  {message.status === "failed" && <small>No reply received</small>}
                </article>
              ))}
              {isSending && (
                <div className="chatbot-typing" role="status"><Bot size={18} aria-hidden="true" /><Spinner label="Thinking..." /></div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="chatbot-error" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{error.message}</span>
            {error.retryable && failedRequest && (
              <button type="button" onClick={() => void submitMessage(failedRequest.message, failedRequest)}
                disabled={isSending || isCoolingDown || isDenied}>
                <RefreshCw size={15} /> Retry
              </button>
            )}
          </div>
        )}

        <form className="chatbot-composer" onSubmit={submitDraft}>
          <label htmlFor="chatbot-message-input">Your message</label>
          <div className="chatbot-input-row">
            <textarea id="chatbot-message-input" ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown} maxLength={CHATBOT_LIMITS.message} rows={2} disabled={isSending || isDenied}
              placeholder="Ask about your parcels..." aria-describedby="chatbot-input-status" />
            <button className="chatbot-send-button" type="submit" title="Send message" aria-label="Send message" disabled={cannotSend}>
              <ArrowUp size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="chatbot-composer-meta" id="chatbot-input-status">
            <span role="status">{isCoolingDown ? `Please wait ${remainingSeconds}s before trying again.` : ""}</span>
            <span>{draft.length} / {CHATBOT_LIMITS.message}</span>
          </div>
        </form>
      </div>
    </section>
  );
}
